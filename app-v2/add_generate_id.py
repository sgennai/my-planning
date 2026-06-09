import os

path1 = 'src/ui/helpers.tsx'
with open(path1, 'a') as f:
    f.write('\nexport function generateId(): string {\n  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).substring(2, 15);\n}\n')

path2 = 'src/create/CreateScreen.tsx'
with open(path2, 'r') as f: text = f.read()
if "import { generateId }" not in text:
    text = text.replace("import type {", "import { generateId } from '../ui/helpers';\nimport type {")
text = text.replace("crypto.randomUUID()", "generateId()")
with open(path2, 'w') as f: f.write(text)
