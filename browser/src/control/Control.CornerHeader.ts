// @ts-strict-ignore
/* -*- js-indent-level: 8 -*- */
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
 * L.Control.CornerHeader
 */

/*
	Calc only.
*/

/* global $ app */

namespace cool {

export class CornerHeader extends CanvasSectionObject {
	name: string = L.CSections.CornerHeader.name;
	anchor: any = [[L.CSections.ColumnGroup.name, 'bottom', 'top'], [L.CSections.RowGroup.name, 'right', 'left']];
	size: number[] = [48 * app.dpiScale, 19 * app.dpiScale]; // These values are static.
	processingOrder: number = L.CSections.CornerHeader.processingOrder;
	drawingOrder: number = L.CSections.CornerHeader.drawingOrder;
	zIndex: number = L.CSections.CornerHeader.zIndex;
	sectionProperties: any = { cursor: 'pointer' }

	_map: any;
	_textColor: string;

	constructor() { super(); }

	onInitialize():void {
		this._map = L.Map.THIS;

		this._map.on('darkmodechanged', this._initCornerHeaderStyle, this);
		this._initCornerHeaderStyle();
	}

	onClick(): void {
		this._map.wholeRowSelected = true;
		this._map.wholeColumnSelected = true;
		this._map.sendUnoCommand('.uno:SelectAll');
		// Row and column selections trigger updatecursor: message
		// and eventually _updateCursorAndOverlay function is triggered and focus will be at the map
		// thus the keyboard shortcuts like delete will work again.
		// selecting whole page does not trigger that and the focus will be lost.
		const docLayer = this._map._docLayer;
		if (docLayer)
			docLayer._updateCursorAndOverlay();
	}

	onMouseEnter(): void {
		this.containerObject.getCanvasStyle().cursor = this.sectionProperties.cursor;
		$.contextMenu('destroy', '#document-canvas');
	}

	onMouseLeave(): void {
		this.containerObject.getCanvasStyle().cursor = 'default';
	}

	_initCornerHeaderStyle(): void {
		const baseElem = document.getElementsByTagName('body')[0];
		const elem = L.DomUtil.create('div', 'spreadsheet-header-row', baseElem);
		this._textColor = L.DomUtil.getStyle(elem, 'color');
		this.backgroundColor = L.DomUtil.getStyle(elem, 'background-color'); // This is a section property.
		this.borderColor = L.DomUtil.getStyle(elem, 'border-top-color'); // This is a section property.
		L.DomUtil.remove(elem);
	}
}

}

L.Control.CornerHeader = cool.CornerHeader;

L.control.cornerHeader = function () {
	return new L.Control.CornerHeader();
};
