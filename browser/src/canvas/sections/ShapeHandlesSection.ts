// @ts-strict-ignore
/* global Proxy _ */
/*
 * Copyright the Collabora Online contributors.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/

/*
	This class is for the modifier handles of shape objects.
	Shape is rendered on the core side. Only the handles are drawn here and modification commands are sent to the core side.
*/

class HelperLineStyles {
	static initiated: false;
	static gridSolidStyle: string = null;
	static gridDashedStyle: string = null;
	static smartGuidesStyle: string = null;
	static darkModeListenerAdded = false;

	private static addListener() {
		app.map.on('darkmodechanged', function() {
			this.gridSolidStyle = null;
			this.gridDashedStyle = null;
			this.smartGuidesStyle = null;
		}.bind(this));

		this.darkModeListenerAdded = true;
	}

	public static initiate() {
		if (!this.darkModeListenerAdded) this.addListener();

		const tempElement = document.createElement('div');

		tempElement.style.display = 'none';
		document.body.appendChild(tempElement);

		tempElement.style.color = 'var(--color-grid-helper-line-solid)';
		let computedStyle = window.getComputedStyle(tempElement);
		this.gridSolidStyle = computedStyle.color;

		tempElement.style.color = 'var(--color-grid-helper-line-dashed)';
		computedStyle = window.getComputedStyle(tempElement);
		this.gridDashedStyle = computedStyle.color;

		tempElement.style.color = 'var(--color-smart-guides-helper-line)';
		computedStyle = window.getComputedStyle(tempElement);
		this.smartGuidesStyle = computedStyle.color;

		tempElement.remove();
	}
}

class ShapeHandlesSection extends CanvasSectionObject {
	name: string = "shapeHandlesSection";
	processingOrder: number = L.CSections.DefaultForDocumentObjects.processingOrder;
	drawingOrder: number = L.CSections.DefaultForDocumentObjects.drawingOrder;
	zIndex: number = L.CSections.DefaultForDocumentObjects.zIndex;
	documentObject: boolean = true;
	showSection: boolean = false;

	constructor (info: any) {
        super();

		this.sectionProperties.info = null;
		this.sectionProperties.handles = [];
		this.sectionProperties.subSections = [];
		this.sectionProperties.activeHandleIndex = null;
		this.sectionProperties.mouseIsInside = false;
		this.sectionProperties.handleWidth = 12 * app.dpiScale;
		this.sectionProperties.handleHeight = 12 * app.dpiScale;
		this.sectionProperties.anchorWidth = 20 * app.dpiScale;
		this.sectionProperties.anchorHeight = 20 * app.dpiScale;
		this.sectionProperties.rotationHandleWidth = 15 * app.dpiScale;
		this.sectionProperties.rotationHandleHeight = 15 * app.dpiScale;
		this.sectionProperties.gluePointRadius = 10 * app.dpiScale;
		this.sectionProperties.subSectionPrefix = 'shape-handle-';
		this.sectionProperties.previousCursorStyle = null;
		this.sectionProperties.svg = null; // This is for preview of modifications.
		this.sectionProperties.hasVideo = false; // Don't hide svg when there is video content.
		this.sectionProperties.shapeRectangleProperties = null; // Not null when there are scaling handles.
		this.sectionProperties.lastDragDistance = [0, 0];
		this.sectionProperties.pickedIndexX = 0; // Which corner of shape is closest to snap point when moving the shape.
		this.sectionProperties.pickedIndexY = 0; // Which corner of shape is closest to snap point when moving the shape.
		this.sectionProperties.mathObjectBorderColor = 'red'; // Border color for Math objects.

		// These are for snapping the objects to the same level with others' boundaries.
		this.sectionProperties.closestX = null;
		this.sectionProperties.closestY = null;

		this.refreshInfo(info);

		if (HelperLineStyles.gridDashedStyle === null) HelperLineStyles.initiate();
	}

	public refreshInfo(info: any) {
		this.sectionProperties.info = info;
		this.convertToTileTwipsIfNeeded();
		this.getHandles();
		this.updateSize();

		if (GraphicSelection?.extraInfo?.isMathObject === true) {
			// Math objects don't need handles. They are not resizable or rotateable.
			// In this case, we want to draw a rectangle around it. So the user can be sure that they selected the object.

			// For drawing the rectangle, use CanvasSectionContainer's awesome border drawing feature.
			this.borderColor = this.sectionProperties.mathObjectBorderColor;
		} else {
			this.addSubSections();
			this.sectionProperties.shapeRectangleProperties = this.getShapeRectangleProperties();
			this.calculateInitialAnglesOfShapeHandlers();
			this.borderColor = null;
		}
	}

	private convertToTileTwipsIfNeeded() {
		if (app.map._docLayer._docType === 'spreadsheet' && this.sectionProperties.info?.handles?.kinds?.rectangle) {
			const kindList = ['1', '2', '3', '4', '5', '6', '7', '8', '16', '22', '9'];

			for (let i = 0; i < kindList.length; i++) {
				if (this.sectionProperties.info.handles.kinds.rectangle[kindList[i]]) {
					const point = new cool.SimplePoint(parseInt(this.sectionProperties.info.handles.kinds.rectangle[kindList[i]][0].point.x), parseInt(this.sectionProperties.info.handles.kinds.rectangle[kindList[i]][0].point.y));
					app.map._docLayer.sheetGeometry.convertToTileTwips(point);
					this.sectionProperties.info.handles.kinds.rectangle[kindList[i]][0].point.x = point.x;
					this.sectionProperties.info.handles.kinds.rectangle[kindList[i]][0].point.y = point.y;
				}
			}
		}
	}

	public calculateInitialAnglesOfShapeHandlers(shapeRecProps?: any) {
		if (this.sectionProperties.info?.handles?.kinds?.rectangle) {
			if (!shapeRecProps)
				shapeRecProps = this.sectionProperties.shapeRectangleProperties;

			const halfDiagonal = Math.pow(Math.pow(shapeRecProps.width * 0.5, 2) + Math.pow(shapeRecProps.height * 0.5, 2), 0.5);
			for (let i = 0; i < this.sectionProperties.subSections.length; i++) {
				const subSection = this.sectionProperties.subSections[i];

				if (subSection.sectionProperties.ownInfo.kind === '1') {
					subSection.sectionProperties.distanceToCenter = halfDiagonal;
					subSection.sectionProperties.initialAngle = Math.atan2(shapeRecProps.height * 0.5, -shapeRecProps.width * 0.5);
				}
				else if (subSection.sectionProperties.ownInfo.kind === '2') {
					subSection.sectionProperties.distanceToCenter = shapeRecProps.height * 0.5;
					subSection.sectionProperties.initialAngle = Math.atan2(shapeRecProps.height * 0.5, 0);
				}
				else if (subSection.sectionProperties.ownInfo.kind === '3') {
					subSection.sectionProperties.distanceToCenter = halfDiagonal;
					subSection.sectionProperties.initialAngle = Math.atan2(shapeRecProps.height * 0.5, shapeRecProps.width * 0.5);
				}
				else if (subSection.sectionProperties.ownInfo.kind === '4') {
					subSection.sectionProperties.distanceToCenter = shapeRecProps.width * 0.5;
					subSection.sectionProperties.initialAngle = Math.atan2(0, -shapeRecProps.width * 0.5);
				}
				else if (subSection.sectionProperties.ownInfo.kind === '5') {
					subSection.sectionProperties.distanceToCenter = shapeRecProps.width * 0.5;
					subSection.sectionProperties.initialAngle = Math.atan2(0, shapeRecProps.width * 0.5);
				}
				else if (subSection.sectionProperties.ownInfo.kind === '6') {
					subSection.sectionProperties.distanceToCenter = halfDiagonal;
					subSection.sectionProperties.initialAngle = Math.atan2(-shapeRecProps.height * 0.5, -shapeRecProps.width * 0.5);
				}
				else if (subSection.sectionProperties.ownInfo.kind === '7') {
					subSection.sectionProperties.distanceToCenter = shapeRecProps.height * 0.5;
					subSection.sectionProperties.initialAngle = Math.atan2(-shapeRecProps.height * 0.5, 0);
				}
				else if (subSection.sectionProperties.ownInfo.kind === '8') {
					subSection.sectionProperties.distanceToCenter = halfDiagonal;
					subSection.sectionProperties.initialAngle = Math.atan2(-shapeRecProps.height * 0.5, shapeRecProps.width * 0.5);
				}
			}
		}
	}

	public static moveHTMLObjectToMapElement(htmlObjectSection: HTMLObjectSection) {
		htmlObjectSection.getHTMLObject().remove();
		document.getElementById('map').appendChild(htmlObjectSection.getHTMLObject());
	}

	public static mirrorEventsFromSourceToCanvasSectionContainer (sourceElement: HTMLElement): void {
		sourceElement.addEventListener('mousedown', function (e) { app.sectionContainer.onMouseDown(e); e.stopPropagation(); }, true);
		sourceElement.addEventListener('click', function (e) { app.sectionContainer.onClick(e); e.stopPropagation(); }, true);
		sourceElement.addEventListener('dblclick', function (e) { app.sectionContainer.onDoubleClick(e); e.stopPropagation(); }, true);
		sourceElement.addEventListener('contextmenu', function (e) { app.sectionContainer.onContextMenu(e); e.stopPropagation(); }, true);
		sourceElement.addEventListener('wheel', function (e) { app.sectionContainer.onMouseWheel(e); e.stopPropagation(); }, true);
		sourceElement.addEventListener('mouseleave', function (e) { app.sectionContainer.onMouseLeave(e); e.stopPropagation(); }, true);
		sourceElement.addEventListener('mouseenter', function (e) { app.sectionContainer.onMouseEnter(e); e.stopPropagation(); }, true);
		sourceElement.addEventListener('touchstart', function (e) { app.sectionContainer.onTouchStart(e); e.stopPropagation(); }, true);
		sourceElement.addEventListener('touchmove', function (e) { app.sectionContainer.onTouchMove(e); e.stopPropagation(); }, true);
		sourceElement.addEventListener('touchend', function (e) { app.sectionContainer.onTouchEnd(e); e.stopPropagation(); }, true);
		sourceElement.addEventListener('touchcancel', function (e) { app.sectionContainer.onTouchCancel(e); e.stopPropagation(); }, true);
	}

	getShapeWidth(twips = true) {
		let middleLeft = this.sectionProperties.info.handles.kinds.rectangle['4'][0];
		middleLeft = new cool.SimplePoint(parseInt(middleLeft.point.x), parseInt(middleLeft.point.y));

		let middleRight = this.sectionProperties.info.handles.kinds.rectangle['5'][0];
		middleRight = new cool.SimplePoint(parseInt(middleRight.point.x), parseInt(middleRight.point.y));

		if (twips)
			return Math.abs(middleLeft.distanceTo(middleRight.toArray()));
		else
			return Math.abs(middleLeft.pDistanceTo(middleRight.pToArray()));
	}

	getShapeHeight(twips = true) {
		let topMiddle = this.sectionProperties.info.handles.kinds.rectangle['2'][0];
		topMiddle = new cool.SimplePoint(parseInt(topMiddle.point.x), parseInt(topMiddle.point.y));

		let bottomMiddle = this.sectionProperties.info.handles.kinds.rectangle['7'][0];
		bottomMiddle = new cool.SimplePoint(parseInt(bottomMiddle.point.x), parseInt(bottomMiddle.point.y));

		if (twips)
			return Math.abs(topMiddle.distanceTo(bottomMiddle.toArray()));
		else
			return Math.abs(topMiddle.pDistanceTo(bottomMiddle.pToArray()))
	}

	/*
		This is also sent from the core side.
	*/
	getShapeAngleRadians() {
		let topMiddle = this.sectionProperties.info.handles.kinds.rectangle['2'][0];
		topMiddle = new cool.SimplePoint(parseInt(topMiddle.point.x), parseInt(topMiddle.point.y));

		const center = this.getShapeCenter();

		const radians = Math.atan2((center[1] - topMiddle.y), (topMiddle.x - center[0]));
		return radians - Math.PI * 0.5;
	}

	getShapeCenter(twips = true) {
		let topLeft = this.sectionProperties.info.handles.kinds.rectangle['1'][0];
		topLeft = new cool.SimplePoint(parseInt(topLeft.point.x), parseInt(topLeft.point.y));

		let bottomRight = this.sectionProperties.info.handles.kinds.rectangle['8'][0];
		bottomRight = new cool.SimplePoint(parseInt(bottomRight.point.x), parseInt(bottomRight.point.y));

		if (twips)
			return [Math.round((topLeft.x + bottomRight.x) / 2), Math.round((topLeft.y + bottomRight.y) / 2)]; // number array in twips.
		else
			return [Math.round((topLeft.pX + bottomRight.pX) / 2), Math.round((topLeft.pY + bottomRight.pY) / 2)]; // number array in core pixels.
	}

	/*
		Selection rectangle is different from the object's inner rectangle.
		Handlers are positioned based on object's inner rectangle (~borders). So we need to get the object's inner rectangle and its rotation angle.
	*/
	getShapeRectangleProperties() {
		if (!this.sectionProperties.info.handles?.kinds?.rectangle)
			return null;

		return {
			angleRadian: this.getShapeAngleRadians(),
			center: this.getShapeCenter(false),
			height: this.getShapeHeight(false),
			width: this.getShapeWidth(false)
		};
	}

	private getScalingHandles(halfWidth: number, halfHeight: number) {
		if (this.sectionProperties.info?.handles?.kinds?.rectangle) {
			const topLeft = this.sectionProperties.info.handles.kinds.rectangle['1'][0];
			const topMiddle = this.sectionProperties.info.handles.kinds.rectangle['2'][0];
			const topRight = this.sectionProperties.info.handles.kinds.rectangle['3'][0];
			const middleLeft = this.sectionProperties.info.handles.kinds.rectangle['4'][0];
			const middleRight = this.sectionProperties.info.handles.kinds.rectangle['5'][0];
			const bottomLeft = this.sectionProperties.info.handles.kinds.rectangle['6'][0];
			const bottomMiddle = this.sectionProperties.info.handles.kinds.rectangle['7'][0];
			const bottomRight = this.sectionProperties.info.handles.kinds.rectangle['8'][0];

			this.sectionProperties.handles.push({ info: topLeft, point: new app.definitions.simplePoint(topLeft.point.x - halfWidth, topLeft.point.y - halfHeight) });
			this.sectionProperties.handles.push({ info: topMiddle, point: new app.definitions.simplePoint(topMiddle.point.x - halfWidth, topMiddle.point.y - halfHeight) });
			this.sectionProperties.handles.push({ info: topRight, point: new app.definitions.simplePoint(topRight.point.x - halfWidth, topRight.point.y - halfHeight) });
			this.sectionProperties.handles.push({ info: middleLeft, point: new app.definitions.simplePoint(middleLeft.point.x - halfWidth, middleLeft.point.y - halfHeight) });
			this.sectionProperties.handles.push({ info: middleRight, point: new app.definitions.simplePoint(middleRight.point.x - halfWidth, middleRight.point.y - halfHeight) });
			this.sectionProperties.handles.push({ info: bottomLeft, point: new app.definitions.simplePoint(bottomLeft.point.x - halfWidth, bottomLeft.point.y - halfHeight) });
			this.sectionProperties.handles.push({ info: bottomMiddle, point: new app.definitions.simplePoint(bottomMiddle.point.x - halfWidth, bottomMiddle.point.y - halfHeight) });
			this.sectionProperties.handles.push({ info: bottomRight, point: new app.definitions.simplePoint(bottomRight.point.x - halfWidth, bottomRight.point.y - halfHeight) });
		}
	}

	private getAnchorHandle(halfWidth: number, halfHeight: number) {
		if (this.sectionProperties.info?.handles?.kinds?.anchor) {
			const anchor = this.sectionProperties.info.handles.kinds.anchor['16'][0];
			this.sectionProperties.handles.push({ info: anchor, point: new app.definitions.simplePoint(anchor.point.x - halfWidth, anchor.point.y - halfHeight) });
		}
	}

	public getRotationInfo(): any {
		if (!this.sectionProperties.info?.handles?.kinds?.rectangle)
			return;

		let coreAngle = GraphicSelection.selectionAngle;
		if (this.sectionProperties.svg)
			coreAngle = this.sectionProperties.svg.innerHTML.includes('class="Group"') ? 0: coreAngle;

		if (coreAngle !== undefined && coreAngle !== null) {
			coreAngle = coreAngle / 100;
			coreAngle = (coreAngle * Math.PI) / 180;

			while (coreAngle > Math.PI * 2) coreAngle -= Math.PI * 2;
			while (coreAngle < 0) coreAngle += Math.PI * 2;
		}
		else
			coreAngle = null;

		const result = {
			kind: 'ShapeRotationHandle',
			coreAngle: coreAngle
		};

		return result;
	}

	getRotationHandlePosition(rotationInfo: any) {
		const centerX = parseInt(this.sectionProperties.info.handles.kinds.rectangle['2'][0].point.x) * app.twipsToPixels - this.position[0];
		const centerY = parseInt(this.sectionProperties.info.handles.kinds.rectangle['2'][0].point.y) * app.twipsToPixels - this.position[1];
		const diff = 30 * app.dpiScale;

		let y = centerY - diff * Math.sin(rotationInfo.coreAngle + Math.PI * 0.5);
		let x = centerX + diff * Math.cos(rotationInfo.coreAngle + Math.PI * 0.5);

		x -= this.sectionProperties.rotationHandleWidth * 0.5;
		y -= this.sectionProperties.rotationHandleHeight * 0.5;

		return new app.definitions.simplePoint((this.position[0] + x) * app.pixelsToTwips, (this.position[1] + y) * app.pixelsToTwips);
	}

	private getRotationHandle() {
		if (this.sectionProperties.info?.handles?.kinds?.rectangle && !this.sectionProperties.hasVideo) {
			const rotationInfo = this.getRotationInfo(); // Rotation section will read the information from this (parent) class.
			const rotationHandlePosition: cool.SimplePoint = this.getRotationHandlePosition(rotationInfo);
			rotationInfo.initialPosition = rotationHandlePosition.clone();

			// Core side doesn't send a position information for rotation handle. We add this.
			this.sectionProperties.handles.push({ info: rotationInfo, point: rotationHandlePosition });
		}
	}

	private getCustomHandles(halfWidth: number, halfHeight: number) {
		if (this.sectionProperties.info?.handles?.kinds?.custom) {
			const customHandleList = this.sectionProperties.info.handles.kinds.custom['22'];

			if (customHandleList && customHandleList.length > 0) {
				for (let i = 0; i < customHandleList.length; i++) {
					const customHandler = customHandleList[i];
					this.sectionProperties.handles.push({ info: customHandler, point: new app.definitions.simplePoint(customHandler.point.x - halfWidth, customHandler.point.y - halfHeight) });
				}
			}
		}
	}

	private getPolyHandles(halfWidth: number, halfHeight: number) {
		if (this.sectionProperties.info?.handles?.kinds?.poly) {
			if (Array.isArray(this.sectionProperties.info.handles.kinds.poly['9'])) {
				const polyArray = this.sectionProperties.info.handles.kinds.poly['9'];

				for (let i = 0; i < polyArray.length; i++) {
					const poly = polyArray[i];
					this.sectionProperties.handles.push({ info: poly, point: new app.definitions.simplePoint(poly.point.x - halfWidth, poly.point.y - halfHeight) });
				}
			}
		}
	}

	private getGluePoints() {
		if (this.sectionProperties.info?.GluePoints?.shapes) {
			if (Array.isArray(this.sectionProperties.info.GluePoints.shapes)) {
				const shapeArray = this.sectionProperties.info.GluePoints.shapes;

				for (let i = 0; i < shapeArray.length; i++) {
					const shape = shapeArray[i];
					shape.kind = 'GluePoint';
					const glueArray = shape.gluepoints;

					for (let j = 0; j < glueArray.length; j++) {
						const info = Object.assign({}, shape);
						info.id = String(i) + String(j);
						this.sectionProperties.handles.push({ info: info, point: new app.definitions.simplePoint(glueArray[j].point.x, glueArray[j].point.y) });
					}
				}
			}
		}
	}

	// Get the handle positions and other information from the info that core side sent us.
	private getHandles() {
		this.sectionProperties.handles = [];

		const halfWidth = app.pixelsToTwips * (this.sectionProperties.handleWidth * 0.5);
		const halfHeight = app.pixelsToTwips * (this.sectionProperties.handleHeight * 0.5);

		this.getScalingHandles(halfWidth, halfHeight);
		this.getAnchorHandle(halfWidth, halfHeight);
		this.getRotationHandle();
		this.getCustomHandles(halfWidth, halfHeight);
		this.getPolyHandles(halfWidth, halfHeight);
		this.getGluePoints();
	}

	// Update this section's size according to handle coordinates.
	updateSize() {
		this.size = [0, 0];

		if (GraphicSelection.hasActiveSelection())
			this.size = [GraphicSelection.rectangle.pWidth, GraphicSelection.rectangle.pHeight];
	}

	isSVGVisible() {
		if (this.sectionProperties.svg)
			return this.sectionProperties.svg.style.display === '';
		else
			return false;
	}

	removeSVG() {
		if (this.sectionProperties.svg)
			this.sectionProperties.svg.remove();
	}

	addVideoSupportHandlers(videos: any) {
		if (!videos)
			return;

		// slide show may have more than one video and it does not require any selection
		for (var i = 0; i < videos.length; i++) {
			var video = videos[i];
			var sources = video.getElementsByTagName('source');

			video.addEventListener('playing', function() {
				window.setTimeout(function() {
					if (video.webkitDecodedFrameCount === 0 && video.webkitAudioDecodedByteCount === 0) {
						this.showUnsupportedMediaWarning();
					}
				}.bind(this), 1000);
			}.bind(this));

			video.addEventListener('error', function() {
				this.showUnsupportedMediaWarning();
			}.bind(this));

			if (sources.length) {
				sources[0].addEventListener('error', function(error: string) {
					this.showUnsupportedMediaWarning();
				}.bind(this));
			}
		}
	}

	showUnsupportedMediaWarning() {
		var videoWarning = _('Document contains unsupported media');
		L.Map.THIS.uiManager.showSnackbar(videoWarning);
	}

	addEmbeddedVideo(svgString: any) {
		this.sectionProperties.hasVideo = true;
		this.setSVG(svgString);
		this.sectionProperties.svg.remove();
		document.getElementById('map').appendChild(this.sectionProperties.svg);
		this.sectionProperties.svg.style.zIndex = 11; // Update z-index or video buttons are unreachable.

		if (!this.sectionProperties.svg.innerHTML.includes('foreignobject')) {
			console.error('Failed to parse svg for embedded video');
			return;
		}

		var videoContainer = this.sectionProperties.svg;
		var videos = this.sectionProperties.svg.getElementsByTagName('video');

		// fix URL, it's important to have correct WOPISrc, we need to decode "&" before other params
		// like ServerId and Tag so load balancer will not use it as a part of WOPISrc
		// this has to be done here (after parseSVG), because it other case we will fail to get
		// the svg object
		var source = this.sectionProperties.svg.getElementsByTagName('source');
		source[0].src = decodeURIComponent(source[0].src);

		this.addVideoSupportHandlers(videos);
	}

	removeTagFromHTML(data: string, startString: string, endString: string): string {
		let startIndex = data.indexOf(startString);
		let endIndex = data.indexOf(endString, startIndex + 1);

		while (startIndex !== -1 && endIndex !== -1) {
			const toRemove = data.substring(startIndex, endIndex + endString.length);
			data = data.replace(toRemove, '');

			startIndex = data.indexOf(startString);
			endIndex = data.indexOf(endString, startIndex + 1);
		}

		return data;
	}

	getTagFromHTML(data: string, startString: string, endString: string): string {
		const startIndex = data.indexOf(startString);
		const endIndex = data.indexOf(endString, startIndex + 1);

		if (startIndex !== -1 && endIndex !== -1) {
			const pickedData = data.substring(startIndex, endIndex + endString.length);
			return pickedData;
		}
		else {
			return '';
		}
	}

	setSVG(data: string) {
		this.removeSVG();

		data = this.removeTagFromHTML(data, ' style="', '"');

		this.sectionProperties.svg = document.createElement('svg');
		document.getElementById('canvas-container').appendChild(this.sectionProperties.svg);

		this.sectionProperties.svg.innerHTML = data;
		this.sectionProperties.svg.style.position = 'absolute';
		this.sectionProperties.svg.children[0].style.width = this.sectionProperties.svg.children[0].style.height = 'auto';
		this.sectionProperties.svg.children[0].style.transformOrigin = 'center';
		this.sectionProperties.svg.children[0].setAttribute('preserveAspectRatio', 'none');

		this.adjustSVGProperties();
	}

	showSVG() {
		if (this.sectionProperties.svg)
			this.sectionProperties.svg.style.display = '';
	}

	hideSVG() {
		if (this.sectionProperties.svg && !this.sectionProperties.hasVideo)
			this.sectionProperties.svg.style.display = 'none';
	}

	onSectionShowStatusChange() {
		for (let i = 0; i < this.sectionProperties.subSections.length; i++)
			this.sectionProperties.subSections[i].setShowSection(this.showSection);

		if (this.showSection)
			this.showSVG();
		else
			this.hideSVG();
	}

	checkAnchorSubSection(handle: any): any {
		let newSubSection = app.sectionContainer.getSectionWithName(this.sectionProperties.subSectionPrefix + handle.info.id);

		if (!newSubSection) {
			newSubSection = new app.definitions.shapeHandleAnchorSubSection(
				this,
				this.sectionProperties.subSectionPrefix + handle.info.id,
				[this.sectionProperties.anchorWidth / app.dpiScale, this.sectionProperties.anchorHeight / app.dpiScale],
				handle.point.clone(),
				handle.info
			);
			return newSubSection;
		}
		else {
			newSubSection.sectionProperties.ownInfo = handle.info;
			newSubSection.setPosition(handle.point.pX, handle.point.pY);
			return null;
		}
	}

	checkScalingSubSection(handle: any): any {
		let newSubSection = app.sectionContainer.getSectionWithName(this.sectionProperties.subSectionPrefix + handle.info.id);

		if (!newSubSection) {
			newSubSection = new app.definitions.shapeHandleScalingSubSection(
				this,
				this.sectionProperties.subSectionPrefix + handle.info.id,
				[this.sectionProperties.handleWidth, this.sectionProperties.handleHeight],
				handle.point.clone(),
				handle.info,
				GraphicSelection.extraInfo.isCropMode
			);
			return newSubSection;
		}
		else {
			newSubSection.sectionProperties.ownInfo = handle.info;
			newSubSection.setPosition(handle.point.pX, handle.point.pY);
			if (GraphicSelection.extraInfo.isCropMode && !newSubSection.sectionProperties.cropModeEnabled) {
				newSubSection.sectionProperties.cropModeEnabled = GraphicSelection.extraInfo.isCropMode;
			}
			return null;
		}
	}

	checkRotationSubSection(handle: any) {
		let newSubSection = app.sectionContainer.getSectionWithName(this.sectionProperties.subSectionPrefix + 'rotation');

		if (!newSubSection) {
			newSubSection = new app.definitions.shapeHandleRotationSubSection(
				this,
				this.sectionProperties.subSectionPrefix + 'rotation',
				[this.sectionProperties.rotationHandleWidth, this.sectionProperties.rotationHandleHeight],
				handle.point.clone(),
				handle.info
			);
			return newSubSection;
		}
		else {
			newSubSection.sectionProperties.ownInfo = handle.info;
			newSubSection.setPosition(handle.point.pX, handle.point.pY);
			return null;
		}
	}

	checkCustomSubSection(handle: any): any {
		let newSubSection = app.sectionContainer.getSectionWithName(this.sectionProperties.subSectionPrefix + handle.info.id);

		if (!newSubSection) {
			newSubSection = new app.definitions.shapeHandleCustomSubSection(
				this,
				this.sectionProperties.subSectionPrefix + handle.info.id,
				[this.sectionProperties.handleWidth, this.sectionProperties.handleHeight],
				handle.point.clone(),
				handle.info
			);
			return newSubSection;
		}
		else {
			newSubSection.sectionProperties.ownInfo = handle.info;
			newSubSection.setPosition(handle.point.pX, handle.point.pY);
			return null;
		}
	}

	checkPolySubSection(handle: any): any {
		let newSubSection = app.sectionContainer.getSectionWithName(this.sectionProperties.subSectionPrefix + handle.info.id);

		if (!newSubSection) {
			newSubSection = new app.definitions.shapeHandlePolySubSection(
				this,
				this.sectionProperties.subSectionPrefix + handle.info.id,
				[this.sectionProperties.handleWidth, this.sectionProperties.handleHeight],
				handle.point.clone(),
				handle.info
			);
			return newSubSection;
		}
		else {
			newSubSection.sectionProperties.ownInfo = handle.info;
			newSubSection.setPosition(handle.point.pX, handle.point.pY);
			return null;
		}
	}

	checkGluePointSubSection(handle: any): any {
		let newSubSection = app.sectionContainer.getSectionWithName(this.sectionProperties.subSectionPrefix + handle.info.id);

		if (!newSubSection) {
			newSubSection = new app.definitions.shapeHandleGluePointSubSection(
				this,
				this.sectionProperties.subSectionPrefix + handle.info.id,
				[this.sectionProperties.gluePointRadius, this.sectionProperties.gluePointRadius],
				handle.point.clone(),
				handle.info
			);
			return newSubSection;
		}
		else {
			newSubSection.sectionProperties.ownInfo = handle.info;
			newSubSection.setPosition(handle.point.pX, handle.point.pY);
			return null;
		}
	}

	addSubSections() {
		for (let i = 0; i < this.sectionProperties.handles.length; i++) {
			let newSubSection: any = null;
			if (this.sectionProperties.handles[i].info.kind === '16')
				newSubSection = this.checkAnchorSubSection(this.sectionProperties.handles[i]);
			else if (['1', '2', '3', '4', '5', '6', '7', '8'].includes(this.sectionProperties.handles[i].info.kind))
				newSubSection = this.checkScalingSubSection(this.sectionProperties.handles[i]);
			else if (this.sectionProperties.handles[i].info.kind === 'ShapeRotationHandle')
				newSubSection = this.checkRotationSubSection(this.sectionProperties.handles[i]);
			else if (this.sectionProperties.handles[i].info.kind === '22')
				newSubSection = this.checkCustomSubSection(this.sectionProperties.handles[i]);
			else if (this.sectionProperties.handles[i].info.kind === '9')
				newSubSection = this.checkPolySubSection(this.sectionProperties.handles[i]);
			else if (this.sectionProperties.handles[i].info.kind === 'GluePoint')
				newSubSection = this.checkGluePointSubSection(this.sectionProperties.handles[i]);

			if (newSubSection) {
				this.containerObject.addSection(newSubSection as any);
				this.sectionProperties.subSections.push(newSubSection);
			}
		}
	}

	onMouseEnter() {
		this.sectionProperties.previousCursorStyle = this.context.canvas.style.cursor;
		this.context.canvas.style.cursor = 'move';
		this.sectionProperties.mouseIsInside = true;
	}

	onMouseLeave() {
		this.context.canvas.style.cursor = this.sectionProperties.previousCursorStyle;
		this.sectionProperties.mouseIsInside = false;
	}

	adjustSnapTransformCoordinate(x: number, y: number) {
		// Transform command accepts the difference from top left corner.
		// If we are snapping to other corners, we need to adjust the coordinate.

		if (x !== null && [0, 3].includes(this.sectionProperties.pickedIndexX)) x -= this.size[0];
		if (y !== null && [0, 3].includes(this.sectionProperties.pickedIndexY)) y -= this.size[1];

		return x !== null ? x: y;
	}

	sendTransformCommand(point: cool.SimplePoint) {
		let x = this.sectionProperties.closestX;
		if (!x) x = this.sectionProperties.lastDragDistance[0] + this.position[0];
		else x = this.adjustSnapTransformCoordinate(x, null);

		let y = this.sectionProperties.closestY;
		if (!y) y = this.sectionProperties.lastDragDistance[1] + this.position[1];
		else y = this.adjustSnapTransformCoordinate(null, y);

		let yTwips = y * app.pixelsToTwips;
		const docLayer = app.map._docLayer;
		const verticalOffset = docLayer.getFiledBasedViewVerticalOffset();
		if (verticalOffset) {
			// Transform from canvas twips to core twips.
			yTwips -= verticalOffset;
		}

		const parameters = {
			'TransformPosX': {
				'type': 'long',
				'value': Math.round(x * app.pixelsToTwips)
			},
			'TransformPosY': {
				'type': 'long',
				'value': Math.round(yTwips)
			}
		};

		app.map.sendUnoCommand('.uno:TransformDialog', parameters);

		docLayer.requestNewFiledBasedViewTiles();
	}

	onMouseUp(point: cool.SimplePoint, e: MouseEvent): void {
		if (this.sectionProperties.svg)
			this.sectionProperties.svg.style.opacity = 1;

		this.hideSVG();

		(window as any).IgnorePanning = false;

		if (this.containerObject.isDraggingSomething()) {
			if ((window as any).mode.isTablet() || (window as any).mode.isMobile())
				this.sendTransformCommand(point);
			else if ((window as any).mode.isDesktop() && (this.sectionProperties.closestX || this.sectionProperties.closestY)) {
				// We need to snap to the guide-lines. So we send a positioning command after the mouse up event (desktop case).
				// We don't need to do this on mobile because we always send the positioning commands there. No mouse events for mobile.
				setTimeout(() => {
					this.sendTransformCommand(point); // Send to back of the process queue so it performs after buttonup event is sent.
				}, 1);
			}
		}
	}

	findClosestX(xList: number[]) {
		let closest = 1000;
		let pickX = null;
		this.sectionProperties.pickedIndexX = 0;
		if (GraphicSelection.extraInfo.ObjectRectangles) {
			const ordNum = GraphicSelection.extraInfo.OrdNum;
			const rectangles = GraphicSelection.extraInfo.ObjectRectangles;

			for (let i = 0; i < rectangles.length; i++) {
				if (rectangles[i][4] !== ordNum) { // Don't compare it with itself.
					const distances = [];
					for (let j = 0; j < xList.length; j++) {
						distances.unshift(Math.abs(rectangles[i][0] - xList[j]));
						distances.push(Math.abs(rectangles[i][0] + rectangles[i][2] - xList[j]));
					}

					const min = Math.min(...distances);
					const index = distances.indexOf(min);
					if (min < closest) {
						closest = min;
						pickX = index < xList.length ? rectangles[i][0]: rectangles[i][0] + rectangles[i][2];
						this.sectionProperties.pickedIndexX = index;
					}
				}
			}
		}

		if (closest < 10 * app.dpiScale) this.sectionProperties.closestX = pickX;
		else this.sectionProperties.closestX = null;
	}

	findClosestY(yList: number[]) {
		let closest = 1000;
		let pickY = null;
		if (GraphicSelection.extraInfo.ObjectRectangles) {
			const ordNum = GraphicSelection.extraInfo.OrdNum;
			const rectangles = GraphicSelection.extraInfo.ObjectRectangles;
			this.sectionProperties.pickedIndexY = 0;

			for (let i = 0; i < rectangles.length; i++) {
				if (rectangles[i][4] !== ordNum) { // Don't compare it with itself.
					const distances = [];
					for (let j = 0; j < yList.length; j++) {
						distances.unshift(Math.abs(rectangles[i][1] - yList[j]));
						distances.push(Math.abs(rectangles[i][1] + rectangles[i][3] - yList[j]));
					}

					const min = Math.min(...distances);
					const index = distances.indexOf(min);
					if (min < closest) {
						closest = min;
						pickY = index < yList.length ? rectangles[i][1]: rectangles[i][1] + rectangles[i][3];
						this.sectionProperties.pickedIndexY = index;
					}
				}
			}
		}

		if (closest < 10 * app.dpiScale) this.sectionProperties.closestY = pickY;
		else this.sectionProperties.closestY = null;
	}

	private cloneSelectedPartInfoForGridSnap() {
		const selectedPart = Object.assign({}, app.impress.partList[app.map._docLayer._selectedPart]);
		selectedPart.leftBorder *= app.impress.twipsCorrection;
		selectedPart.upperBorder *= app.impress.twipsCorrection;
		selectedPart.rightBorder *= app.impress.twipsCorrection;
		selectedPart.lowerBorder *= app.impress.twipsCorrection;
		selectedPart.gridCoarseWidth *= app.impress.twipsCorrection;
		selectedPart.gridCoarseHeight *= app.impress.twipsCorrection;

		return selectedPart;
	}

	private getInnerRecrangleForGridSnap(selectedPart: any) {
		return new cool.SimpleRectangle(
			selectedPart.leftBorder,
			selectedPart.upperBorder,
			(selectedPart.width - selectedPart.leftBorder - selectedPart.rightBorder),
			(selectedPart.height - selectedPart.upperBorder - selectedPart.lowerBorder)
		);
	}

	private getCornerPointsForGridSnap(size: number[], position: number[], dragDistance: number[]) {
		return [
			new cool.SimplePoint((position[0] + dragDistance[0]) * app.pixelsToTwips, (position[1] + dragDistance[1]) * app.pixelsToTwips),
			new cool.SimplePoint((size[0] + position[0] + dragDistance[0]) * app.pixelsToTwips, (position[1] + dragDistance[1]) * app.pixelsToTwips),
			new cool.SimplePoint((position[0] + dragDistance[0]) * app.pixelsToTwips, (size[1] + position[1] + dragDistance[1]) * app.pixelsToTwips),
			new cool.SimplePoint((size[0] + position[0] + dragDistance[0]) * app.pixelsToTwips, (size[1] + position[1] + dragDistance[1]) * app.pixelsToTwips),
		];
	}

	private findClosestGridPoint(size: number[], position: number[], dragDistance: number[]) {
		// First rule of snap-to-grid: If you enable snap-to-grid, you have to snap.

		const selectedPart = this.cloneSelectedPartInfoForGridSnap();

		// The 4 corners of selected object's rectangle.
		const checkList = this.getCornerPointsForGridSnap(size, position, dragDistance);

		// The rectangle that is shaped by the page margins.
		const innerRectangle = this.getInnerRecrangleForGridSnap(selectedPart);

		const gapX = selectedPart.gridCoarseWidth / (selectedPart.innerSpacesX > 0 ? selectedPart.innerSpacesX : 1);
		const gapY = selectedPart.gridCoarseHeight / (selectedPart.innerSpacesY > 0 ? selectedPart.innerSpacesY : 1);

		let minX = 100000;
		let minY = 100000;
		for (let i = 0; i < 1; i++) {
			if (innerRectangle.containsPoint(checkList[i].toArray())) {

				const countX = Math.round((checkList[i].x - innerRectangle.x1) / gapX);
				const countY = Math.round((checkList[i].y - innerRectangle.y1) / gapY);

				const diffX = Math.abs(checkList[i].x - innerRectangle.x1 - gapX * countX);
				const diffY = Math.abs(checkList[i].y - innerRectangle.y1 - gapY * countY);

				if (diffX < minX) {
					minX = diffX;
					this.sectionProperties.closestX = innerRectangle.x1 + (countX * gapX);
					this.sectionProperties.pickedIndexX = [1, 3].includes(i) ? 0 : 1; // Do we substract width or not.
				}
				if (diffY < minY) {
					minY = diffY;
					this.sectionProperties.closestY = innerRectangle.y1 + (countY * gapY);
					this.sectionProperties.pickedIndexY = [2, 3].includes(i) ? 0 : 1; // Do we substract height or not.
				}
			}
		}

		this.sectionProperties.closestX *= app.twipsToPixels;
		this.sectionProperties.closestY *= app.twipsToPixels;
	}

	public checkObjectsBoundaries(xListToCheck: number[], yListToCheck: number[]) {
		if (app.map._docLayer._docType === 'presentation') {
			this.findClosestX(xListToCheck);
			this.findClosestY(yListToCheck);
		}
	}

	public checkHelperLinesAndSnapPoints(size: number[], position: number[], dragDistance: number[]) {
		/*
			We will first check if grid-snap is enabled and if we are close to a grid point.
			If there is a grid point to snap to, then we'll ignore helper lines.
			Because core side doesn't know about our helper lines, and it'll ignore them if it can snap to a grid point.
		*/

		this.sectionProperties.closestX = null;
		this.sectionProperties.closestY = null;

		if (app.map.stateChangeHandler.getItemValue('.uno:GridUse') === 'true') {
			this.findClosestGridPoint(size, position, dragDistance)
		}
		else {
			this.checkObjectsBoundaries(
				[position[0] + dragDistance[0], position[0] + dragDistance[0] + size[0]],
				[position[1] + dragDistance[1], position[1] + dragDistance[1] + size[1]]
			);
		}

		this.containerObject.requestReDraw();
	}

	onMouseMove(position: cool.SimplePoint, dragDistance: number[]) {
		let canDrag = !app.file.textCursor.visible;

		if (canDrag && app.map.getDocType() === 'presentation') {
			// Tables get selected when multiple cells are selected. In this case, we check if DeleteRows is disabled.
			// Because in non-edit mode, deleteRows is disabled. So we can drag the table.
			const deleteRowsState = app.map.stateChangeHandler.getItemValue('.uno:DeleteRows');
			canDrag = deleteRowsState ? deleteRowsState === 'disabled': true;
		}

		if (this.containerObject.isDraggingSomething() && canDrag) {
			(window as any).IgnorePanning = true;

			if (this.sectionProperties.svg) {
				this.sectionProperties.svg.style.left = String((this.myTopLeft[0] + dragDistance[0]) / app.dpiScale) + 'px';
				this.sectionProperties.svg.style.top = String((this.myTopLeft[1] + dragDistance[1]) / app.dpiScale) + 'px';
				this.sectionProperties.svg.style.opacity = 0.5;
			}
			this.sectionProperties.lastDragDistance = [dragDistance[0], dragDistance[1]];
			this.checkHelperLinesAndSnapPoints(this.size, this.position, dragDistance);

			this.showSVG();
		}
		else
			(window as any).IgnorePanning = false;
	}

	getViewBox(svg: any): number[] {
		let viewBox: any = svg.getAttribute('viewBox');

		if (viewBox) {
			viewBox = viewBox.split(' ');
			for (let i = 0; i < viewBox.length; i++) viewBox[i] = parseInt(viewBox[i]);
		}
		else
			viewBox = null;

		return viewBox;
	}

	adjustSVGProperties() {
		if (this.sectionProperties.svg && this.sectionProperties.svg.style.display === '' && GraphicSelection.hasActiveSelection()) {
			const widthText = GraphicSelection.rectangle.cWidth + 'px';
			const heightText = GraphicSelection.rectangle.cHeight + 'px';

			const viewBox: number[] = this.getViewBox(this.sectionProperties.svg.children[0]);
			const isImage = this.sectionProperties.svg.querySelectorAll('.Graphic').length > 0;

			const clientRect = (this.sectionProperties.svg.children[0] as SVGElement).getBoundingClientRect();

			if (viewBox && !isImage && clientRect.width > 0 && clientRect.height > 0) {
				this.sectionProperties.svg.children[0].style.width = widthText;
				this.sectionProperties.svg.children[0].style.height = heightText;
			}
			else {
				this.sectionProperties.svg.style.width = widthText;
				this.sectionProperties.svg.style.height = heightText;

				if (isImage) {
					this.sectionProperties.svg.children[0].style.width = widthText;
					this.sectionProperties.svg.children[0].style.height = heightText;
				}
			}

			const left = GraphicSelection.rectangle.pX1;
			const top = GraphicSelection.rectangle.pY1;

			this.sectionProperties.svg.style.left = Math.round((left - this.documentTopLeft[0] + this.containerObject.getDocumentAnchor()[0]) / app.dpiScale) + 'px';
			this.sectionProperties.svg.style.top = Math.round((top - this.documentTopLeft[1] + this.containerObject.getDocumentAnchor()[1]) / app.dpiScale) + 'px';
			this.sectionProperties.svgPosition = [left, top];
		}
		this.hideSVG();
	}

	onNewDocumentTopLeft(size: number[]): void {
		if (this.sectionProperties.svgPosition) {
			this.sectionProperties.svg.style.left = (this.sectionProperties.svgPosition[0] - (this.documentTopLeft[0] + this.containerObject.getDocumentAnchor()[0]) / app.dpiScale) + 'px';
			this.sectionProperties.svg.style.top = (this.sectionProperties.svgPosition[1] - (this.documentTopLeft[1] + this.containerObject.getDocumentAnchor()[1]) / app.dpiScale) + 'px';
		}
	}

	drawXAxis(x: number) {
		this.context.moveTo(x, 0);
		this.context.lineTo(x, this.context.canvas.height);
		this.context.stroke();
	}

	drawYAxis(y: number) {
		this.context.moveTo(0, y);
		this.context.lineTo(this.context.canvas.width, y);
		this.context.stroke();
	}

	drawShapeAlignmentHelperLines() {
		this.context.save();

		this.context.setLineDash([4, 3]);
		this.context.strokeStyle = HelperLineStyles.smartGuidesStyle;
		this.context.translate(-this.myTopLeft[0], -this.myTopLeft[1]);

		this.context.beginPath();

		if (this.sectionProperties.closestX !== null)
			this.drawXAxis(this.containerObject.getDocumentAnchor()[0] + this.sectionProperties.closestX - this.documentTopLeft[0]);

		if (this.sectionProperties.closestY !== null)
			this.drawYAxis(this.containerObject.getDocumentAnchor()[1] + this.sectionProperties.closestY - this.documentTopLeft[1]);

		this.context.closePath();

		this.context.restore();
	}

	drawGridHelperLines() {
		this.context.save();

		this.context.translate(-this.myTopLeft[0], -this.myTopLeft[1]);

		this.context.beginPath();

		if (this.sectionProperties.closestX !== null) {
			this.context.strokeStyle = HelperLineStyles.gridSolidStyle;
			this.context.setLineDash([]);

			const x = this.containerObject.getDocumentAnchor()[0] + this.sectionProperties.closestX - this.documentTopLeft[0];

			this.drawXAxis(x);

			// Draw a second line on top of solid white-ish line.
			this.context.setLineDash([4, 3]);
			this.context.strokeStyle = HelperLineStyles.gridDashedStyle;

			this.drawXAxis(x);
		}

		if (this.sectionProperties.closestY !== null) {
			this.context.strokeStyle = HelperLineStyles.gridSolidStyle;
			this.context.setLineDash([]);

			const y = this.containerObject.getDocumentAnchor()[1] + this.sectionProperties.closestY - this.documentTopLeft[1];

			this.drawYAxis(y);

			// Draw a second line on top of solid white-ish line.
			this.context.setLineDash([4, 3]);
			this.context.strokeStyle = HelperLineStyles.gridDashedStyle;

			this.drawYAxis(y);
		}

		this.context.closePath();

		this.context.restore();
	}

	private anythingToDraw(): boolean {
		return 	this.sectionProperties.closestX !== null ||
				this.sectionProperties.closestY !== null;
	}

	public onDraw() {
		if (!this.showSection || !this.isVisible)
			this.hideSVG();
		else if (this.anythingToDraw()) {
			if (app.map.stateChangeHandler.getItemValue('.uno:GridUse') === 'true')
				this.drawGridHelperLines();
			else
				this.drawShapeAlignmentHelperLines();
		}
	}

	removeSubSections(): void {
		this.removeSVG();
		for (let i = 0; i < this.sectionProperties.subSections.length; i++) {
			this.containerObject.removeSection(this.sectionProperties.subSections[i].name);
		}
	}
}

app.definitions.shapeHandlesSection = ShapeHandlesSection;
