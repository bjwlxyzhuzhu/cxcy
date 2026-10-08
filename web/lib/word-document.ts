import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from 'docx';

/** 真正的 Office Open XML 文档，浏览器导出与回传解析共用此格式。 */
export function createWordDocument(title: string, markdown: string, subtitle = '') {
  const children: (Paragraph | Table)[] = [];
  const runs = (text: string) => text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(t => new TextRun({text: t.replace(/^\*\*|\*\*$/g,''), bold: t.startsWith('**'), font:'宋体', color:'000000'}));
  if(title) children.push(new Paragraph({text:title,heading:HeadingLevel.TITLE}));
  if(subtitle) children.push(new Paragraph({children:runs(subtitle)}));
  const lines=markdown.replace(/\r/g,'').split('\n');
  const cells=(s:string)=>s.trim().replace(/^\||\|$/g,'').split('|').map(v=>v.trim());
  for(let i=0;i<lines.length;i++) {
    const line=lines[i];
    if(/^\s*\|.*\|\s*$/.test(line)&&/^\s*\|[\s:|-]+\|\s*$/.test(lines[i+1]||'')) {
      const rows=[cells(line)];i+=2;
      while(i<lines.length&&/^\s*\|.*\|\s*$/.test(lines[i]))rows.push(cells(lines[i++]));
      i--;
      children.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:rows.map((r,index)=>new TableRow({tableHeader:index===0,children:r.map(c=>new TableCell({children:[new Paragraph({children:runs(c)})]}))}))}));
      continue;
    }
    const heading=line.match(/^(#{1,4})\s+(.*)$/);
    const levels=[HeadingLevel.HEADING_1,HeadingLevel.HEADING_2,HeadingLevel.HEADING_3,HeadingLevel.HEADING_4];
    children.push(new Paragraph({children:runs(heading?heading[2]:line),...(heading?{heading:levels[heading[1].length-1]}:{}),spacing:{after:120}}));
  }
  return new Document({styles:{default:{document:{run:{font:'宋体',size:24,color:'000000'}}}},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1134,bottom:1134,left:1417,right:1417}}},children}]});
}
export async function wordBlob(title:string,body:string,subtitle='') {
  return Packer.toBlob(createWordDocument(title,body,subtitle));
}
