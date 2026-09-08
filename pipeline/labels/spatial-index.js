import {validRect} from './geometry.js';
export class SpatialIndex {
  constructor(cellSize=64) {if(!(cellSize>0))throw new Error('Invalid cell size');this.size=cellSize;this.cells=new Map();}
  keys(rect) {
    validRect(rect);const result=[];
    for(let x=Math.floor(rect.x/this.size);x<=Math.floor((rect.x+rect.width)/this.size);x++)
      for(let y=Math.floor(rect.y/this.size);y<=Math.floor((rect.y+rect.height)/this.size);y++)result.push(x+','+y);
    return result;
  }
  insert(id,rect) {for(const key of this.keys(rect)){if(!this.cells.has(key))this.cells.set(key,new Set());this.cells.get(key).add(id);}}
  query(rect) {const ids=new Set();for(const key of this.keys(rect))for(const id of this.cells.get(key)||[])ids.add(id);return [...ids];}
}
