import { useMemo, useRef, useState } from "react";
import { EmptyState, Notice, SectionCard, SectionTitle } from "./SchoolKit.jsx";
import inputClass from "./inputClass.js";
import { importStudents, parseRegister, scanRegister } from "../../services/schoolApi.js";

// Longest side of a photographed register sent to the model. Bigger than this costs
// tokens without reading any better, so the browser shrinks the picture first.
const MAX_EDGE = 1600;

const normalise = (value) => String(value || "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();

function downscale(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That photograph could not be opened."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("That photograph could not be opened."));
      image.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That file could not be opened."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export default function StudentImport({ classId, roster, onDone }) {
  const [mode, setMode] = useState("photo");
  const [rows, setRows] = useState([]);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef(null);

  const existing = useMemo(() => new Set((roster || []).map((item) => normalise(item.name))), [roster]);

  const review = useMemo(
    () =>
      rows.map((row) => {
        const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
        const duplicate = existing.has(normalise(name));
        const unsure = row.confidence !== undefined && row.confidence !== null && row.confidence < 0.7;
        return { ...row, name, duplicate, unsure };
      }),
    [rows, existing]
  );

  const kept = review.filter((row) => !row.skip && row.name);
  const unsureCount = kept.filter((row) => row.unsure).length;
  const duplicateCount = review.filter((row) => row.duplicate).length;

  async function handleFile(file) {
    if (!file) return;
    setError("");
    setResult(null);
    setReading(true);
    try {
      let payload;
      if (mode === "photo") {
        const dataUrl = await downscale(file);
        payload = await scanRegister(dataUrl, "image/jpeg");
      } else {
        const dataUrl = await readBase64(file);
        payload = await parseRegister(file.name, dataUrl);
      }
      const found = (payload.rows || []).map((row) => ({
        ...row,
        skip: existing.has(normalise(row.name)),
      }));
      if (!found.length) throw new Error("No names were found. Try a clearer photograph or a different file.");
      setRows(found);
    } catch (readError) {
      setError(readError.message || "That register could not be read.");
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function update(index, key, value) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, [key]: value, confidence: 1, note: "" } : row)));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const payload = await importStudents({
        class_id: classId,
        students: kept.map((row) => ({
          first_name: row.first_name.trim(),
          last_name: row.last_name.trim(),
          admission_no: row.admission_no || "",
        })),
      });
      setResult(payload);
      setRows([]);
      onDone?.();
    } catch (saveError) {
      setError(saveError.message || "Those students could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard>
      <SectionTitle
        icon="document_scanner"
        title="Import a class list"
        note="Photograph the register, or upload a spreadsheet"
      />

      <div className="mt-3 flex gap-2">
        {[
          { id: "photo", label: "Photograph", icon: "photo_camera" },
          { id: "file", label: "Spreadsheet", icon: "table_view" },
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              setMode(option.id);
              setRows([]);
              setResult(null);
              setError("");
            }}
            className={`flex-1 h-11 rounded-xl font-label-md text-label-md flex items-center justify-center gap-1.5 ${
              mode === option.id
                ? "bg-secondary text-on-secondary"
                : "border border-white/15 bg-white/[0.04] text-on-surface"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{option.icon}</span>
            {option.label}
          </button>
        ))}
      </div>

      <label className="mt-3 block">
        <input
          ref={fileInput}
          type="file"
          accept={mode === "photo" ? "image/*" : ".csv,.xlsx,.xls"}
          capture={mode === "photo" ? "environment" : undefined}
          disabled={reading || !classId}
          onChange={(event) => handleFile(event.target.files?.[0])}
          className="w-full text-body-sm text-on-surface file:mr-3 file:rounded-xl file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-label-md file:text-on-secondary"
          aria-label={mode === "photo" ? "Photograph of the class register" : "Class list spreadsheet"}
        />
      </label>
      {!classId && (
        <p className="mt-2 font-label-sm text-label-sm text-on-surface-variant">
          Choose the class this list belongs to above.
        </p>
      )}

      {reading && (
        <p className="mt-3 flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant">
          <span className="ps-spinner !w-4 !h-4 !border-2" />
          Reading the register...
        </p>
      )}
      {error && <p className="mt-3 rounded-xl bg-error-container px-3 py-2 font-body-sm text-body-sm text-on-error-container">{error}</p>}

      {result && (
        <Notice>
          Registered {result.created?.length || 0} student{result.created?.length === 1 ? "" : "s"} in{" "}
          {result.class?.name || "the class"}.
          {result.assigned_admissions ? ` ${result.assigned_admissions} admission number(s) were assigned automatically.` : ""}
          {result.skipped?.length ? ` ${result.skipped.length} skipped: ${result.skipped.map((row) => row.name).join(", ")}.` : ""}
        </Notice>
      )}

      {review.length > 0 && (
        <div className="mt-4">
          <p className="font-label-md text-label-md text-on-surface">
            {review.length} name{review.length === 1 ? "" : "s"} read
            {unsureCount ? ` · ${unsureCount} need a check` : ""}
            {duplicateCount ? ` · ${duplicateCount} already registered` : ""}
          </p>
          <ul className="mt-2 max-h-96 overflow-y-auto divide-y divide-white/5">
            {review.map((row, index) => (
              <li key={`${row.name}-${index}`} className={`py-2 ${row.skip ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-2">
                  <input
                    className="w-6 h-6 shrink-0 accent-secondary"
                    type="checkbox"
                    checked={!row.skip}
                    onChange={(event) =>
                      setRows((current) => current.map((item, i) => (i === index ? { ...item, skip: !event.target.checked } : item)))
                    }
                    aria-label={`Include ${row.name || "this row"}`}
                  />
                  <input
                    className={inputClass}
                    value={row.first_name}
                    onChange={(event) => update(index, "first_name", event.target.value)}
                    aria-label={`First name for row ${index + 1}`}
                  />
                  <input
                    className={inputClass}
                    value={row.last_name}
                    onChange={(event) => update(index, "last_name", event.target.value)}
                    aria-label={`Last name for row ${index + 1}`}
                  />
                </div>
                {(row.unsure || row.duplicate || row.note) && (
                  <p className="mt-1 pl-8 font-label-sm text-label-sm text-amber-300">
                    {row.duplicate
                      ? "Already on this class list. Unticked so you do not register them twice."
                      : row.note || "The handwriting was unclear. Check the spelling."}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={save}
            disabled={saving || kept.length === 0}
            className="mt-3 w-full rounded-xl bg-secondary px-4 py-2.5 font-label-md text-label-md text-on-secondary disabled:opacity-50"
          >
            {saving ? "Registering..." : `Register ${kept.length} student${kept.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      {review.length === 0 && !reading && !result && (
        <div className="mt-3">
          <EmptyState icon={mode === "photo" ? "photo_camera" : "table_view"} title="Nothing read yet">
            {mode === "photo"
              ? "Lay the register flat in good light and photograph the whole page."
              : "Upload a .csv or .xlsx list with a column of student names."}
          </EmptyState>
        </div>
      )}
    </SectionCard>
  );
}
