import { amount, type Meals, type Recipe, type shoppingList } from "./domain.ts";
type ShoppingRow = ReturnType<typeof shoppingList>[number];
export function shoppingText(rows: ShoppingRow[], checked: string[]) {
  const categories = [...new Set(rows.map((row) => row.category))];
  return "Shopping list\n\n" + categories.map((category) =>
    category + "\n" + rows.filter((row) => row.category === category).map((row) =>
      `${checked.includes(row.key) ? "[x]" : "[ ]"} ${row.name} — ${amount(row.quantity, row.unit)}${row.preparations.length ? " (" + row.preparations.join("; ") + ")" : ""}`
    ).join("\n")
  ).join("\n\n");
}
export function planText(recipes: Recipe[], meals: Meals) {
  return "Meal plan\n\n" + recipes.map((recipe, index) =>
    `${index + 1}. ${recipe.title} — ${meals[recipe.id]} servings${recipe.sourceUrl ? "\n" + recipe.sourceUrl : ""}`
  ).join("\n\n");
}
function download(blob: Blob, extension: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "supperbook-shopping-list." + extension;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportShoppingList(format: "txt" | "docx" | "pdf" | "copy", text: string) {
  if (format === "copy") { await navigator.clipboard.writeText(text); return; }
  if (format === "txt") { download(new Blob([text], { type: "text/plain;charset=utf-8" }), "txt"); return; }
  if (format === "docx") {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
    const document = new Document({
      sections: [{ children: text.split("\n").map((line, index) => new Paragraph({
        heading: index === 0 ? HeadingLevel.TITLE : undefined,
        spacing: { after: 120 },
        children: [new TextRun({ text: line, font: "Georgia", size: index === 0 ? 40 : 22 })],
      })) }],
    });
    download(await Packer.toBlob(document), "docx"); return;
  }
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF();
  pdf.setFont("times", "normal");
  let y = 22;
  for (const [index, line] of text.split("\n").entries()) {
    pdf.setFontSize(index === 0 ? 22 : 12);
    for (const wrapped of pdf.splitTextToSize(line || " ", 170) as string[]) {
      if (y > 276) { pdf.addPage(); y = 22; }
      pdf.text(wrapped, 20, y); y += index === 0 ? 11 : 6;
    }
  }
  pdf.save("supperbook-shopping-list.pdf");
}
