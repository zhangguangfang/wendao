import { Hand, Moon, Repeat2, MessageCircle, ArrowRight, Feather, Wind } from "lucide-react";
import Dialog from "./Dialog";
import type { ReliefSession } from "../types";
import "./care-features.css";

export const careScenes = [
  { id: "contact", title: "很想联系对方", detail: "先放下想说的话", Icon: MessageCircle },
  { id: "repeat", title: "脑中反复回放", detail: "慢慢回到此刻", Icon: Repeat2 },
  { id: "sleep", title: "睡前有些难受", detail: "先让身体舒服一点", Icon: Moon },
  { id: "blame", title: "总在责怪自己", detail: "给自己一点理解", Icon: Hand },
] as const;
export type CareScene = typeof careScenes[number]["id"];
export type WritingSeed = { title: string; body: string; direction: "self" | "free" };
const guidance = {
  repeat: {
    heading: "先轻轻认出这个念头", text: "可以在心里说：“我注意到自己又想起了那件事。”暂时不必找到答案。试着描述眼前一样物品的颜色、形状或触感。",
    technique: "grounding", label: "做一次感官练习", prompt: "我注意到自己又想起了：\n\n此刻我能够看见、听见或触到的是：\n\n接下来我想照顾自己的方式是：\n",
  },
  sleep: {
    heading: "先把睡着这件事放轻一点", text: "如果方便，可以调暗屏幕，找一个舒服的姿势。让身体休息也是照顾，不需要强迫自己马上入睡。练习不舒服时，可以随时停止。",
    technique: "breathing", label: "试试轻柔的呼吸", prompt: "今晚盘旋在心里的事情是：\n\n可以留到明天再考虑的是：\n\n此刻能让身体舒服一点的事情是：\n",
  },
  blame: {
    heading: "试着把事实和责备分开", text: "写下发生了什么，再留意“我不够好”这样的评价。如果同样的事发生在一位朋友身上，你愿意对他说什么？你也可以给自己同样的理解。",
    technique: "grounding", label: "先感受脚下的地面", prompt: "这件事中，我能够确认的事实是：\n\n我对自己说的责备是：\n\n如果这是我的朋友，我愿意对他说：\n\n此刻我可以为自己做的是：\n",
  },
} as const;
export default function CareGuide({ scene, onClose, onPractice, onWrite }: {
  scene: Exclude<CareScene, "contact">;
  onClose: () => void;
  onPractice: (feeling: string, technique: ReliefSession["technique"]) => void;
  onWrite: (seed: WritingSeed) => void;
}) {
  const current = guidance[scene];
  const label = careScenes.find((item) => item.id === scene)!;
  return <Dialog title={label.title} onClose={onClose} className="care-modal">
    <div className="care-guide-lead"><label.Icon size={30} strokeWidth={1.4} /><h3>{current.heading}</h3><p>{current.text}</p></div>
    <p className="care-intro">选一种此刻愿意尝试的方式，也可以直接离开。</p>
    <div className="care-next-options">
      <button className="care-choice" onClick={() => onPractice(scene, current.technique)}><Wind size={19} /><strong>{current.label}</strong><span>按你的节奏，各步骤都可以跳过。</span><ArrowRight size={16} /></button>
      <button className="care-choice" onClick={() => onWrite({ title: label.title === "总在责怪自己" ? "给此刻的自己" : "把心事先放在这里", body: current.prompt, direction: scene === "blame" ? "self" : "free" })}><Feather size={19} /><strong>跟着提示写几句话</strong><span>打开一封新信，提示文字可以修改或删掉。</span><ArrowRight size={16} /></button>
    </div>
  </Dialog>;
}
