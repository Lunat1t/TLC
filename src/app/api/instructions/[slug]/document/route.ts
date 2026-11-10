import { NextResponse } from "next/server"
import { errorResponse, InstructionError, serverClient } from "@/lib/instructions/access"
import { publicDriveDownloadUrl } from "@/lib/instructions/google-drive"
export const runtime="nodejs"
export const maxDuration=60
export async function GET(_request:Request,{params}:{params:Promise<{slug:string}>}) {
 try {
  const {slug}=await params
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new InstructionError(404,"not_found","Инструкция не найдена.")
  const client=await serverClient()
  const {data:fileId,error}=await client.rpc("published_instruction_drive_file",{p_slug:slug})
  if(error||typeof fileId!=="string")throw new InstructionError(404,"not_found","PDF не найден.")
  const response=await fetch(await publicDriveDownloadUrl(fileId),{cache:"no-store",signal:AbortSignal.timeout(45000)})
  const limit=25_000_000
  if(!response.ok||!response.body)throw new InstructionError(503,"pdf_unavailable","Не удалось загрузить PDF. Попробуйте скачать оригинал.")
  if(Number(response.headers.get("content-length"))>limit){await response.body.cancel();throw new InstructionError(413,"large_pdf","Для большого PDF используйте скачивание.")}
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0
  try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new InstructionError(413,"large_pdf","Для большого PDF используйте скачивание.");chunks.push(value)}}finally{await reader.cancel()}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  if(new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")throw new InstructionError(503,"pdf_unavailable","Google Drive не отдал PDF. Попробуйте скачать оригинал.")
  return new NextResponse(bytes,{headers:{"Content-Type":"application/pdf","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}})
 }catch(error){return errorResponse(error)}
}
