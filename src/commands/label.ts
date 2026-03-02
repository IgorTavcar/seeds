import { Command } from "commander";
import { findSeedsDir } from "../config.ts";
import { accent, muted, outputJson } from "../output.ts";
import { issuesPath, readIssues, withLock, writeIssues } from "../store.ts";
import type { Issue } from "../types.ts";

function cleanLabels(labels: string[] | undefined): string[] | undefined {
	if (!labels || labels.length === 0) return undefined;
	return labels;
}

export async function run(args: string[], seedsDir?: string): Promise<void> {
	const jsonMode = args.includes("--json");
	const positional = args.filter((a) => !a.startsWith("--"));

	const subcmd = positional[0];
	if (!subcmd) throw new Error("Usage: sd label <add|remove|list|list-all>");

	const dir = seedsDir ?? (await findSeedsDir());

	if (subcmd === "list-all") {
		const issues = await readIssues(dir);
		const counts = new Map<string, number>();
		for (const issue of issues) {
			for (const label of issue.labels ?? []) {
				counts.set(label, (counts.get(label) ?? 0) + 1);
			}
		}
		const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

		if (jsonMode) {
			const labels = sorted.map(([label, count]) => ({ label, count }));
			outputJson({ success: true, command: "label list-all", labels });
		} else {
			if (sorted.length === 0) {
				console.log("No labels found.");
				return;
			}
			console.log(`${accent.bold("All Labels")}\n`);
			for (const [label, count] of sorted) {
				console.log(`  ${accent(label)} ${muted(`(${String(count)})`)}`);
			}
		}
		return;
	}

	if (subcmd === "list") {
		const issueId = positional[1];
		if (!issueId) throw new Error("Usage: sd label list <issue>");
		const issues = await readIssues(dir);
		const issue = issues.find((i) => i.id === issueId);
		if (!issue) throw new Error(`Issue not found: ${issueId}`);

		const labels = issue.labels ?? [];

		if (jsonMode) {
			outputJson({ success: true, command: "label list", issueId, labels });
		} else {
			console.log(`${accent.bold(issueId)} ${muted("labels:")}`);
			if (labels.length > 0) {
				for (const label of labels) {
					console.log(`  ${accent(label)}`);
				}
			} else {
				console.log(muted("  No labels."));
			}
		}
		return;
	}

	if (subcmd === "add" || subcmd === "remove") {
		const rest = positional.slice(1);
		if (rest.length < 2) {
			throw new Error(`Usage: sd label ${subcmd} <issue-id...> <label>`);
		}
		const label = rest[rest.length - 1]!;
		const issueIds = rest.slice(0, -1);

		if (!label.trim()) {
			throw new Error("Label cannot be empty");
		}

		await withLock(issuesPath(dir), async () => {
			const issues = await readIssues(dir);

			for (const issueId of issueIds) {
				const idx = issues.findIndex((i) => i.id === issueId);
				if (idx === -1) throw new Error(`Issue not found: ${issueId}`);

				const issue = issues[idx]!;
				const now = new Date().toISOString();

				if (subcmd === "add") {
					const labels = Array.from(new Set([...(issue.labels ?? []), label]));
					issues[idx] = { ...issue, labels, updatedAt: now };
				} else {
					const labels = (issue.labels ?? []).filter((l) => l !== label);
					issues[idx] = { ...issue, labels: cleanLabels(labels), updatedAt: now };
				}
			}

			await writeIssues(dir, issues);
		});

		if (jsonMode) {
			outputJson({
				success: true,
				command: `label ${subcmd}`,
				issueIds,
				label,
			});
		} else {
			const verb = subcmd === "add" ? "Added" : "Removed";
			const ids = issueIds.map((id) => accent(id)).join(", ");
			console.log(
				`${verb} label ${accent(label)} ${muted(subcmd === "add" ? "to" : "from")} ${ids}`,
			);
		}
		return;
	}

	throw new Error(`Unknown label subcommand: ${subcmd}. Use add, remove, list, or list-all.`);
}

export function register(program: Command): void {
	const label = new Command("label").description("Manage issue labels");

	label
		.command("add <args...>")
		.description("Add a label to one or more issues (last arg = label)")
		.option("--json", "Output as JSON")
		.action(async (args: string[], opts: { json?: boolean }) => {
			const runArgs: string[] = ["add", ...args];
			if (opts.json) runArgs.push("--json");
			await run(runArgs);
		});

	label
		.command("remove <args...>")
		.description("Remove a label from one or more issues (last arg = label)")
		.option("--json", "Output as JSON")
		.action(async (args: string[], opts: { json?: boolean }) => {
			const runArgs: string[] = ["remove", ...args];
			if (opts.json) runArgs.push("--json");
			await run(runArgs);
		});

	label
		.command("list <issue>")
		.description("Show labels on an issue")
		.option("--json", "Output as JSON")
		.action(async (issue: string, opts: { json?: boolean }) => {
			const runArgs: string[] = ["list", issue];
			if (opts.json) runArgs.push("--json");
			await run(runArgs);
		});

	label
		.command("list-all")
		.description("Show all unique labels across all issues with counts")
		.option("--json", "Output as JSON")
		.action(async (opts: { json?: boolean }) => {
			const runArgs: string[] = ["list-all"];
			if (opts.json) runArgs.push("--json");
			await run(runArgs);
		});

	program.addCommand(label);
}
