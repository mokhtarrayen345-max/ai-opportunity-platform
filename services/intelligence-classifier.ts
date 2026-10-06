import {signalTypes,type IntelligenceSignal} from "@/services/intelligence-domain";
export interface SignalClassifier{classify(signal:{title:string;summary:string;normalizedContent:string;topic:string}):{signalType:typeof signalTypes[number];confidence:number;aiInterpretation:string[];assumptions:string[];unknowns:string[]}}
export class DeterministicSignalClassifier implements SignalClassifier{
  classify(signal:{title:string;summary:string;normalizedContent:string;topic:string}){
    const text=(signal.title+" "+signal.summary+" "+signal.normalizedContent).toLowerCase();
    const rules:Array<[typeof signalTypes[number],string[]]>=[
      ["user_complaint",["complaint","frustrated","unhappy","complain"]],
      ["product_failure",["bug","broken","failure","crash","doesn't work","not working"]],
      ["market_change",["market","price","demand","regulation","competitor"]],
      ["business_opportunity",["opportunity","need","gap","underserved"]],
      ["technology_change",["ai","technology","release","framework","model"]],
      ["startup_signal",["startup","funding","seed round","launch"]],
      ["trend",["trend","growing","rising","viral"]],
      ["problem_report",["problem","issue","pain point"]]
    ];
    for(const [kind,words] of rules) if(words.some(w=>text.includes(w))) return {signalType:kind,confidence:80,aiInterpretation:[],assumptions:[],unknowns:["Classification is deterministic and not external verification."]};
    return {signalType:"other",confidence:55,aiInterpretation:[],assumptions:[],unknowns:["Signal type requires additional evidence."]};
  }
}
export class MockSignalClassifier extends DeterministicSignalClassifier {}
