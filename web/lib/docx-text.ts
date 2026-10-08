import mammoth from 'mammoth';

export async function readDocxText(buffer: Buffer) {
  try {
    const {value}=await mammoth.extractRawText({buffer});
    return value.trim();
  } catch {
    throw new Error('无法读取此DOCX。请用Word/WPS打开后另存为“Word文档（.docx）”再上传；不要只修改文件后缀。');
  }
}
