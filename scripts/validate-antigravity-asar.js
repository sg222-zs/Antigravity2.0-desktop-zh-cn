const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appRoot =
  process.argv[2] ||
  path.join(process.env.LOCALAPPDATA || "", "Programs", "antigravity");
const asarPath = path.join(appRoot, "resources", "app.asar");

function decodeAsar(data) {
  const headerSize = data.readUInt32LE(4);
  const headerPickle = data.subarray(8, 8 + headerSize);
  const headerStringSize = headerPickle.readInt32LE(4);
  const headerString = headerPickle
    .subarray(8, 8 + headerStringSize)
    .toString("utf8");
  return { headerSize, header: JSON.parse(headerString) };
}

function walk(node, prefix, out) {
  for (const [name, child] of Object.entries(node.files || {})) {
    const filePath = prefix ? `${prefix}/${name}` : name;
    if (child.files) walk(child, filePath, out);
    else out.push({ filePath, entry: child });
  }
}

function readEntry(data, headerSize, entry) {
  const start = 8 + headerSize + Number(entry.offset);
  return data.subarray(start, start + Number(entry.size));
}

const data = fs.readFileSync(asarPath);
const { headerSize, header } = decodeAsar(data);
const entries = [];
walk(header, "", entries);

const distJs = entries.filter(
  ({ filePath, entry }) =>
    filePath.startsWith("dist/") &&
    filePath.endsWith(".js") &&
    !entry.unpacked &&
    entry.offset !== undefined
);

for (const { filePath, entry } of distJs) {
  const source = readEntry(data, headerSize, entry).toString("utf8");
  new vm.Script(source, { filename: filePath });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      asarPath,
      checkedDistJs: distJs.length,
      hasZhPatch: readEntry(
        data,
        headerSize,
        entries.find(({ filePath }) => filePath === "dist/utils.js").entry
      )
        .toString("utf8")
        .includes("__antigravityZhCnMainWorldPatchSource"),
    },
    null,
    2
  )
);
