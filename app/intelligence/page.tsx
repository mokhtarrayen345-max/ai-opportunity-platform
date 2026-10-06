import {redirect} from "next/navigation";
import {getCurrentUser} from "@/lib/auth";
import {IntelligencePanel} from "@/components/intelligence-panel";
export default async function Intelligence(){const user=await getCurrentUser();if(!user)redirect("/auth");return <div className="container page"><p className="eyebrow">Intelligence Foundation V1</p><h1>Signals before opportunities.</h1><p className="lead narrow">Review normalized source signals, then explicitly trigger the existing Opportunity Engine when a signal deserves assessment.</p><IntelligencePanel/></div>