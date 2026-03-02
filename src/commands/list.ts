import type { Command } from "commander";
import { findSeedsDir } from "../config.ts";
import { outputJson, printIssueOneLine } from "../output.ts";
import { readIssues } from "../store.ts";
import type { Issue } from "../types.ts";

function parseArgs(args: string[]) {
	const flags: Record<string, string | boolean> = {};
	let i = 0;
	while (i < args.length) {
		const arg = args[i];
		if (!arg) {
			i++;
			continue;
		}
		if (arg.startsWith("--")) {
			const key = arg.slice(2);
			const eqIdx = key.indexOf("=");
			if (eqIdx !== -1) {
				flags[key.slice(0, eqIdx)] = key.slice(eqIdx + 1);
				i++;
			} else {
				const next = args[i + 1];
				if (next !== undefined && !next.startsWith("--")) {
					flags[key] = next;
					i += 2;
				} else {
					flags[key] = true;
					i++;
				}
			}
		} else {
			i++;
		}
	}
	return flags;
}

export async function run(args: string[], seedsDir?: string): Promise<void> {
	const jsonMode = args.includes("--json");
	const flags = parseArgs(args);

	const statusFilter = typeof flags.status === "string" ? flags.status : undefined;
	const typeFilter = typeof flags.type === "string" ? flags.type : undefined;
	const assigneeFilter = typeof flags.assignee === "string" ? flags.assignee : undefined;
	const labelAndFilter =
		typeof flags.label === "string"
			? flags.label
					.split(",")
					.map((s) => s.trim())
					.filter((s) => s.length > 0)
			: undefined;
	const labelOrFilter =
		typeof flags["label-any"] === "string"
			? flags["label-any"]
					.split(",")
					.map((s) => s.trim())
					.filter((s) => s.length > 0)
			: undefined;
	const noLabels = flags.unlabeled === true;
	const showAll = flags.all === true;
	const limitStr = typeof flags.limit === "string" ? flags.limit : "50";
	const limit = Number.parseInt(limitStr, 10) || 50;

	const dir = seedsDir ?? (await findSeedsDir());
	let issues = await readIssues(dir);

	if (statusFilter) {
		issues = issues.filter((i: Issue) => i.status === statusFilter);
	} else if (!showAll) {
		issues = issues.filter((i: Issue) => i.status !== "closed");
	}
	if (typeFilter) issues = issues.filter((i: Issue) => i.type === typeFilter);
	if (assigneeFilter) issues = issues.filter((i: Issue) => i.assignee === assigneeFilter);
	if (labelAndFilter && labelAndFilter.length > 0) {
		issues = issues.filter((i: Issue) => {
			const labels = i.labels ?? [];
			return labelAndFilter.every((l) => labels.includes(l));
		});
	}
	if (labelOrFilter && labelOrFilter.length > 0) {
		issues = issues.filter((i: Issue) => {
			const labels = i.labels ?? [];
			return labelOrFilter.some((l) => labels.includes(l));
		});
	}
	if (noLabels) {
		issues = issues.filter((i: Issue) => !i.labels || i.labels.length === 0);
	}

	issues = issues.slice(0, limit);

	if (jsonMode) {
		outputJson({ success: true, command: "list", issues, count: issues.length });
	} else {
		if (issues.length === 0) {
			console.log("No issues found.");
			return;
		}
		for (const issue of issues) {
			printIssueOneLine(issue);
		}
		console.log(`\n${issues.length} issue(s)`);
	}
}

export function register(program: Command): void {
	program
		.command("list")
		.description("List issues with filters")
		.option("--status <status>", "Filter by status (open|in_progress|closed)")
		.option("--type <type>", "Filter by type (task|bug|feature|epic)")
		.option("--assignee <name>", "Filter by assignee")
		.option("--all", "Include closed issues (default: only open/in_progress)")
		.option("--label <labels>", "Filter by labels (comma-separated, AND logic)")
		.option("--label-any <labels>", "Filter by labels (comma-separated, OR logic)")
		.option("--unlabeled", "Show only issues without labels")
		.option("--limit <n>", "Max issues to show", "50")
		.option("--json", "Output as JSON")
		.action(
			async (opts: {
				status?: string;
				type?: string;
				assignee?: string;
				all?: boolean;
				label?: string;
				labelAny?: string;
				unlabeled?: boolean;
				limit?: string;
				json?: boolean;
			}) => {
				const args: string[] = [];
				if (opts.status) args.push("--status", opts.status);
				if (opts.type) args.push("--type", opts.type);
				if (opts.assignee) args.push("--assignee", opts.assignee);
				if (opts.all) args.push("--all");
				if (opts.label) args.push("--label", opts.label);
				if (opts.labelAny) args.push("--label-any", opts.labelAny);
				if (opts.unlabeled) args.push("--unlabeled");
				if (opts.limit) args.push("--limit", opts.limit);
				if (opts.json) args.push("--json");
				await run(args);
			},
		);
}
