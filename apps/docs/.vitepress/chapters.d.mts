export interface ChapterSection {
  title: string;
  items: [string, string][];
}
export const sections: ChapterSection[];
export const requiredPages: string[];
export const pageHelp: Record<string, string>;
