import { writeQmm } from "../../../lib/qmwriter";
import { QuestWithMetadata } from "./idb";
import { decompileQms } from "../../../lib/qms/decompiler";
import { QM } from "../../../lib/qmreader";

export function downloadQuest(quest: QuestWithMetadata) {
  const arrayBuffer = writeQmm(quest);
  const blob = new Blob([arrayBuffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  // TODO: Maybe add minor and major versions?
  // Maybe add current date string?
  link.download = quest.filename ? quest.filename + ".qmm" : "quest.qmm";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 1000);
}

function downloadTextFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 1000);
}

export function decompileQuest(quest: QuestWithMetadata) {
  const s = decompileQms(quest as QM);
  const filename = quest.filename 
    ? quest.filename + ".qms" 
    : "quest.qms";
  downloadTextFile(s, filename)
}