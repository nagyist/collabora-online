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
 * L.Control.ColumnGroup
 */

/* global app */

/*
	This file is Calc only. This adds a section for grouped columns in Calc.
	When user selects some columns and groups them using "Data->Group and Outline->Group" menu path, this section is added into
	sections list of CanvasSectionContainer. See _addRemoveGroupSections in file CalcTileLayer.js

	This class is an extended version of "CanvasSectionObject".
*/

namespace cool {

export class ColumnGroup extends GroupBase {
	name: string = L.CSections.ColumnGroup.name;
	anchor: any = ['top', [L.CSections.CornerGroup.name, 'right', 'left']];
	expand: string[] = ['left', 'right']; // Expand horizontally.
	processingOrder: number = L.CSections.ColumnGroup.processingOrder;
	drawingOrder: number = L.CSections.ColumnGroup.drawingOrder;
	zIndex: number = L.CSections.ColumnGroup.zIndex;

	_sheetGeometry: cool.SheetGeometry;
	_cornerHeaderWidth: number;
	_splitPos: cool.Point;

	constructor() { super(); }

	update(): void {
		if (this.isRemoved) // Prevent calling while deleting the section. It causes errors.
			return;

		this._sheetGeometry = this._map._docLayer.sheetGeometry;
		this._groups = Array(this._sheetGeometry.getColumnGroupLevels());

		// Calculate width on the fly.
		this.size[1] = this._computeSectionHeight();

		this._cornerHeaderWidth = this.containerObject.getSectionWithName(L.CSections.CornerHeader.name).size[0];

		this._splitPos = (this._map._docLayer._splitPanesContext as cool.SplitPanesContext).getSplitPos();

		this._collectGroupsData(this._sheetGeometry.getColumnGroupsDataInView());
	}

	// This returns the required height for the section.
	_computeSectionHeight(): number {
		return this._levelSpacing + (this._groupHeadSize + this._levelSpacing) * (this._groups.length + 1);
	}

	isGroupHeaderVisible (startX: number, startPos: number): boolean {
		if (startPos > this._splitPos.x) {
			return startX > this._splitPos.x + this._cornerHeaderWidth;
		}
		else {
			return startX >= this._cornerHeaderWidth && (startX > this.documentTopLeft[0] || startX < this._splitPos.x);
		}
	}

	getEndPosition (endPos: number): number {
		if (endPos <= this._splitPos.x)
			return endPos;
		else {
			return Math.max(endPos + this._cornerHeaderWidth - this.documentTopLeft[0], this._splitPos.x + this._cornerHeaderWidth);
		}
	}

	getRelativeX (docPos: number): number {
		if (docPos < this._splitPos.x)
			return docPos + this._cornerHeaderWidth;
		else
			return Math.max(docPos - this.documentTopLeft[0], this._splitPos.x) + this._cornerHeaderWidth;
	}

	drawGroupControl (group: GroupEntry): void {
		let startX = this.getRelativeX(group.startPos);
		let startY = this._levelSpacing + (this._groupHeadSize + this._levelSpacing) * group.level;
		const strokeColor = this.getColors().strokeColor;
		const endX = this.getEndPosition(group.endPos);

		if (this.isGroupHeaderVisible(startX, group.startPos)) {
			// draw head
			this.context.beginPath();
			this.context.fillStyle = this.backgroundColor;
			this.context.fillRect(this.transformRectX(startX, this._groupHeadSize), startY, this._groupHeadSize, this._groupHeadSize);
			this.context.strokeStyle = strokeColor;
			this.context.lineWidth = 1.0;
			this.context.strokeRect(this.transformRectX(startX + 0.5, this._groupHeadSize), startY + 0.5, this._groupHeadSize, this._groupHeadSize);

			if (!group.hidden) {
				// draw '-'
				this.context.beginPath();
				this.context.moveTo(this.transformX(startX + this._groupHeadSize * 0.25), startY + this._groupHeadSize * 0.5 + 0.5);
				this.context.lineTo(this.transformX(startX + this._groupHeadSize * 0.75 + app.roundedDpiScale), startY + this._groupHeadSize * 0.5 + 0.5);
				this.context.stroke();
			}
			else {
				// draw '+'
				this.context.beginPath();
				this.context.moveTo(this.transformX(startX + this._groupHeadSize * 0.25), startY + this._groupHeadSize * 0.5 + 0.5);
				this.context.lineTo(this.transformX(startX + this._groupHeadSize * 0.75 + app.roundedDpiScale), startY + this._groupHeadSize * 0.5 + 0.5);

				this.context.stroke();

				this.context.moveTo(this.transformX(startX + this._groupHeadSize * 0.50 + 0.5), startY + this._groupHeadSize * 0.25);
				this.context.lineTo(this.transformX(startX + this._groupHeadSize * 0.50 + 0.5), startY + this._groupHeadSize * 0.75 + app.roundedDpiScale);

				this.context.stroke();
			}
		}

		if (!group.hidden && endX > this._cornerHeaderWidth + this._groupHeadSize && endX > startX) {
			//draw tail
			this.context.beginPath();
			startX += this._groupHeadSize;
			startX = startX >= this._cornerHeaderWidth + this._groupHeadSize ? startX: this._cornerHeaderWidth + this._groupHeadSize;
			startY += this._groupHeadSize * 0.5;
			startX = Math.round(startX) + 1;
			startY = Math.round(startY);
			this.context.strokeStyle = strokeColor;
			this.context.lineWidth = 2.0;
			this.context.moveTo(this.transformX(startX), startY);
			this.context.lineTo(this.transformX(endX - app.roundedDpiScale), startY);
			this.context.stroke();
		}
	}

	drawLevelHeader (level: number): void {
		this.context.beginPath();
		const ctx = this.context;
		const ctrlHeadSize = this._groupHeadSize;
		const levelSpacing = this._levelSpacing;

		const startX = Math.round((this._cornerHeaderWidth - ctrlHeadSize) * 0.5);
		const startY = levelSpacing + (ctrlHeadSize + levelSpacing) * level;

		ctx.strokeStyle = this.getColors().strokeColor;
		ctx.lineWidth = 1.0;
		ctx.strokeRect(this.transformRectX(startX + 0.5, ctrlHeadSize), startY + 0.5, ctrlHeadSize, ctrlHeadSize);
		// draw level number
		ctx.fillStyle = this._textColor;
		ctx.font = this._getFont();
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText((level + 1).toString(), this.transformX(startX + (ctrlHeadSize / 2)), startY + (ctrlHeadSize / 2) + 2 * app.dpiScale);
	}

	// Handle user interaction.
	_updateOutlineState (group: Partial<GroupEntry>): void {
		const state = group.hidden ? 'visible' : 'hidden'; // we have to send the new state
		const payload = 'outlinestate type=column' + ' level=' + group.level + ' index=' + group.index + ' state=' + state;
		app.socket.sendMessage(payload);
	}

	// When user clicks somewhere on the section, onMouseClick event is called by CanvasSectionContainer.
	// Clicked point is also given to handler function. This function finds the clicked header.
	findClickedLevel (point: cool.SimplePoint): number {
		const mirrorX = this.isCalcRTL();
		if ((!mirrorX && point.pX < this._cornerHeaderWidth)
			|| (mirrorX && point.pX > this.size[0] - this._cornerHeaderWidth)) {
			let index = (point.pY / this.size[1]) * 100; // Percentage.
			const levelPercentage = (1 / (this._groups.length + 1)) * 100; // There is one more button than the number of levels.
			index = Math.floor(index / levelPercentage);
			return index;
		}
		return -1;
	}

	findClickedGroup (point: cool.SimplePoint): GroupEntry {
		const mirrorX = this.isCalcRTL();
		for (let i = 0; i < this._groups.length; i++) {
			if (this._groups[i]) {
				for (const group in this._groups[i]) {
					if (Object.prototype.hasOwnProperty.call(this._groups[i], group)) {
						const group_ = this._groups[i][group];
						const startX = this.getRelativeX(group_.startPos);
						const startY = this._levelSpacing + (this._groupHeadSize + this._levelSpacing) * group_.level;
						const endX = startX + this._groupHeadSize;
						const endY = startY + this._groupHeadSize;
						if (group_.level == 0 && this.isPointInRect(point, startX, startY, endX, endY, mirrorX))
							return group_;
						else if (this._isPreviousGroupVisible(group_.level, group_.startPos, group_.endPos, group_.hidden) && this.isPointInRect(point, startX, startY, endX, endY, mirrorX)) {
							return group_;
						}
					}
				}
			}
		}
		return null;
	}

	getTailsGroupRect (group: GroupEntry): number[] {
		const startX = this.getRelativeX(group.startPos);
		const startY = this._levelSpacing + (this._groupHeadSize + this._levelSpacing) * group.level;
		const endX = group.endPos + this._cornerHeaderWidth - this.documentTopLeft[0];
		const endY = startY + this._groupHeadSize;
		return [startX, endX, startY, endY];
	}

	onRemove(): void {
		this.isRemoved = true;
		this.containerObject.getSectionWithName(L.CSections.ColumnHeader.name).position[1] = 0;
		this.containerObject.getSectionWithName(L.CSections.CornerHeader.name).position[1] = 0;
	}
}

}

L.Control.ColumnGroup = cool.ColumnGroup;

L.control.columnGroup = function () {
	return new L.Control.ColumnGroup();
};
