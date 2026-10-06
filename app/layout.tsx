import type { Metadata } from "next";
import "./globals.css";
import { Navigation } from "@/components/navigation";
export const metadata: Metadata = { title:"AI Opportunity Platform", description:"Discover opportunities, analyze problems, and solve them with AI-ready workflows." };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><Navigation/><main>{children}</main></body></html>}