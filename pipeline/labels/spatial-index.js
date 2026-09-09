import {validRect} from './geometry.js';
export class SpatialIndex {
  constructor(cellSize=64) {if(!(cellSize>0))throw new Error('Invalid cell size');this.size=cellSize;this.columns=new Map();}
  keys(rect) {
    validRect(rect);const result=[];
    for(let x=Math.floor(rect.x/this.size);x<=Math.floor((rect.x+rect.width)/this.size);x++)
      for(let y=Math.floor(rect.y/this.size);y<=Math.floor((rect.y+rect.height)/this.size);y++)result.push(x+','+y);
    return result;
  }
  insert(id,rect) {
    validRect(rect);const right=Math.floor((rect.x+rect.width)/this.size),top=Math.floor(rect.y/this.size),bottom=Math.floor((rect.y+rect.height)/this.size);
    for(let x=Math.floor(rect.x/this.size);x<=right;x++){
      let column=this.columns.get(x);if(!column){column=new Map();this.columns.set(x,column);}
      for(let y=top;y<=bottom;y++){let cell=column.get(y);if(!cell){cell=new Set();column.set(y,cell);}cell.add(id);}
    }
  }
  query(rect) {
    validRect(rect);const ids=new Set(),right=Math.floor((rect.x+rect.width)/this.size),top=Math.floor(rect.y/this.size),bottom=Math.floor((rect.y+rect.height)/this.size);
    for(let x=Math.floor(rect.x/this.size);x<=right;x++){
      const column=this.columns.get(x);if(!column)continue;
      for(let y=top;y<=bottom;y++){const cell=column.get(y);if(cell)for(const id of cell)ids.add(id);}
    }
    return [...ids];
  }
}
