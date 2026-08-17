import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const MAX_TRACKED_FILE_BYTES = 1024 * 1024;
const mode = process.argv.includes("--all") ? "all" : "staged";

function git(args, options = {}) {
  return execFileSync("git", args, {
    encoding: options.encoding ?? "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function listFiles() {
  const output =
    mode === "all"
      ? git(["ls-files", "-z"])
      : git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]);
  return output.split("\0").filter(Boolean);
}

function readFile(path) {
  if (mode === "staged") {
    return git(["show", `:${path}`], { encoding: "buffer" });
  }
  return readFileSync(path);
}

function isAllowedEnvExample(path) {
  const name = path.split("/").at(-1) ?? path;
  return name === ".env.example" || /^\.env\..+\.example$/u.test(name);
}

function pathViolation(path) {
  const normalized = path.replaceAll("\\", "/");
  const name = normalized.split("/").at(-1)?.toLowerCase() ?? "";

  if ((name === ".env" || name.startsWith(".env.")) && !isAllowedEnvExample(path)) {
    return "dotenv file";
  }
  if (/^(?:id_(?:rsa|dsa|ecdsa|ed25519)|credentials)$/u.test(name)) {
    return "credential or private-key file";
  }
  if (/\.(?:pem|key|p12|pfx|jks|keystore|sqlite3?|db|har|pcap|pcapng)$/u.test(name)) {
    return "credential, database, or captured-traffic artifact";
  }
  if (/(?:^|\/)\.pi(?:\/|$)/u.test(normalized)) {
    return "Pi state directory";
  }
  if (/(?:^|\/)results\/(?:raw|judgments)(?:\/|$)/u.test(normalized)) {
    return "raw evaluation or judgment artifact";
  }
  if (/(?:^|\/)(?:sessions?|traces?)(?:\/|$)/iu.test(normalized)) {
    return "session or trace directory";
  }
  if (/(?:^|[._-])session(?:[._-].*)?\.jsonl?$/iu.test(name)) {
    return "session export";
  }
  return undefined;
}

function isReservedEmail(email) {
  const domain = email.toLowerCase().split("@").at(-1) ?? "";
  return (
    domain === "localhost" ||
    domain === "example.com" ||
    domain === "example.org" ||
    domain === "example.net" ||
    domain.endsWith(".example") ||
    domain.endsWith(".test") ||
    domain.endsWith(".invalid")
  );
}

function hasPaymentCardNumber(line) {
  const candidates = line.match(/(?:\d[ -]?){13,19}/gu) ?? [];
  return candidates.some((candidate) => {
    const digits = candidate.replace(/\D/gu, "");
    if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/u.test(digits)) return false;

    let sum = 0;
    let doubleDigit = false;
    for (let index = digits.length - 1; index >= 0; index -= 1) {
      let digit = Number(digits[index]);
      if (doubleDigit) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      doubleDigit = !doubleDigit;
    }
    return sum % 10 === 0;
  });
}

function contentViolations(path, buffer) {
  if (buffer.includes(0)) return [];
  const text = buffer.toString("utf8");
  const findings = [];
  const lines = text.split(/\r?\n/u);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (/(?:^|[\s"'`])\/(?:home|Users)\/[A-Za-z0-9._-]+\//u.test(line)) {
      findings.push({ line: lineNumber, rule: "absolute personal home path" });
    }
    if (/(?:^|[\s"'`])[A-Za-z]:\\Users\\[^\\\s"'`]+\\/u.test(line)) {
      findings.push({ line: lineNumber, rule: "absolute Windows user path" });
    }
    if (/\b\d{3}-\d{2}-\d{4}\b/u.test(line)) {
      findings.push({ line: lineNumber, rule: "US Social Security number pattern" });
    }
    if (/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/u.test(line)) {
      findings.push({ line: lineNumber, rule: "private key material" });
    }

    const emails = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu) ?? [];
    if (emails.some((email) => !isReservedEmail(email))) {
      findings.push({ line: lineNumber, rule: "non-example email address" });
    }
    if (hasPaymentCardNumber(line)) {
      findings.push({ line: lineNumber, rule: "payment card number pattern" });
    }
  });

  return findings;
}

const findings = [];
for (const path of listFiles()) {
  const pathRule = pathViolation(path);
  if (pathRule) findings.push({ path, rule: pathRule });

  let buffer;
  try {
    buffer = readFile(path);
  } catch {
    findings.push({ path, rule: "could not inspect file contents" });
    continue;
  }

  const size = mode === "all" ? statSync(path).size : buffer.length;
  if (size > MAX_TRACKED_FILE_BYTES) {
    findings.push({
      path,
      rule: "tracked file exceeds 1 MiB; keep large/raw artifacts outside git",
    });
    continue;
  }

  for (const finding of contentViolations(path, buffer)) {
    findings.push({ path, ...finding });
  }
}

if (findings.length > 0) {
  console.error(
    "Data-safety check failed. No matched values are printed to avoid leaking them into logs.\n",
  );
  for (const finding of findings) {
    const location = finding.line ? `${finding.path}:${finding.line}` : finding.path;
    console.error(`- ${location}: ${finding.rule}`);
  }
  console.error(
    "\nUse synthetic data with reserved domains such as example.com. Remove or redact real data before committing.",
  );
  process.exit(1);
}

console.log(`Data-safety check passed for ${mode === "all" ? "all tracked" : "staged"} files.`);
