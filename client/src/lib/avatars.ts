import avatar1 from "@assets/ChatGPT_Image_2_янв._2026_г.,_23_10_41_1767385457804.png";
import avatar2 from "@assets/ChatGPT_Image_2_янв._2026_г.,_23_11_44_1767385457804.png";
import avatar3 from "@assets/ChatGPT_Image_2_янв._2026_г.,_23_12_57_1767385457805.png";
import avatar4 from "@assets/ChatGPT_Image_2_янв._2026_г.,_23_15_43_1767385457805.png";
import avatar5 from "@assets/ChatGPT_Image_2_янв._2026_г.,_23_16_22_1767385457805.png";
import avatar6 from "@assets/ChatGPT_Image_2_янв._2026_г.,_23_17_14_1767385457805.png";

export const AVATARS = [
  { id: 1, src: avatar1, name: "Randy" },
  { id: 2, src: avatar2, name: "Editor" },
  { id: 3, src: avatar3, name: "Sound" },
  { id: 4, src: avatar4, name: "Director" },
  { id: 5, src: avatar5, name: "Camera" },
  { id: 6, src: avatar6, name: "Stan" },
] as const;

export function getAvatarById(id: number): string | undefined {
  const avatar = AVATARS.find(a => a.id === id);
  return avatar?.src;
}
