import { readFile } from "fs/promises";
import path from "path";
import { Card, CardContent } from "@/components/ui/card";

export default async function ChangelogPage() {
  const changelogPath = path.join(process.cwd(), "CHANGELOG.md");
  let content = "";
  
  try {
    content = await readFile(changelogPath, "utf-8");
  } catch (error) {
    content = "# Changelog\n\nChangelog file not found.";
  }

  // process inline markdown formatting
  const processInline = (text: string): string => {
    // links
    text = text.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">$1</a>'
    );
    // bold
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // inline code
    text = text.replace(
      /`([^`]+)`/g,
      '<code class="bg-muted px-1 py-0.5 rounded text-sm font-mono">$1</code>'
    );
    return text;
  };

  // simple markdown to html conversion for basic formatting
  const htmlContent = content
    .split("\n")
    .map((line) => {
      // headers
      if (line.startsWith("### ")) {
        return `<h3 class="text-lg font-semibold mt-6 mb-3">${processInline(line.slice(4))}</h3>`;
      }
      if (line.startsWith("## ")) {
        return `<h2 class="text-xl font-bold mt-8 mb-4 pb-2 border-b">${processInline(line.slice(3))}</h2>`;
      }
      if (line.startsWith("# ")) {
        return `<h1 class="text-2xl font-bold mb-6">${processInline(line.slice(2))}</h1>`;
      }
      // list items
      if (line.startsWith("- ")) {
        return `<li class="ml-4 mb-1 list-disc">${processInline(line.slice(2))}</li>`;
      }
      // code blocks
      if (line.startsWith("```")) {
        return "";
      }
      // empty line
      if (line.trim() === "") {
        return '<div class="h-2"></div>';
      }
      // regular paragraph
      return `<p class="mb-2 text-sm">${processInline(line)}</p>`;
    })
    .join("\n");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <a href="/" className="text-sm text-muted-foreground hover:text-primary">
          ← Back to Dashboard
        </a>
      </div>
      
      <Card>
        <CardContent className="pt-6">
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
