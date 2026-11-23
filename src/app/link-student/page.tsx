"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
export default function LinkStudentPage(){const router=useRouter();useEffect(()=>{const token=new URLSearchParams(window.location.search).get("token");if(token&&/^[0-9a-f-]{36}$/i.test(token)){sessionStorage.setItem("tlc.pending-student",token);router.replace("/settings")}else router.replace("/settings")},[router]);return <main className="p-8">Открываем связь с учеником…</main>}
