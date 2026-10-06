"use client";
import { useRouter } from "next/navigation";
export function SignOutButton(){const router=useRouter();async function signOut(){await fetch("/api/auth/signout",{method:"POST"});router.push("/");router.refresh();}return <button className="button" onClick={signOut}>Sign out</button>}
