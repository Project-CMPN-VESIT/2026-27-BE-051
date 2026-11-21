"use client";
import { useState } from "react";
import { X, Plus, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { skillsApi } from "@/lib/api";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/api/client";
import type { ProjectSkillRead } from "@/lib/api";

const PROFICIENCY_COLORS: Record<string, string> = {
  beginner: "bg-primary/12 text-primary",
  intermediate: "bg-background-warning text-text-warning",
  expert: "bg-background-success text-text-success",
};

// ── User skills manager ───────────────────────────────────────────────────────

export function UserSkillsManager() {
  const [input, setInput] = useState("");
  const [proficiency, setProficiency] = useState<"beginner" | "intermediate" | "expert">("intermediate");
  const [error, setError] = useState<string | null>(null);
  const debouncedInput = useDebounce(input, 300);
  const qc = useQueryClient();

  const { data: mySkills, isLoading } = useQuery({
    queryKey: ["my-skills"],
    queryFn: skillsApi.mySkills,
  });

  const { data: suggestions } = useQuery({
    queryKey: ["skill-suggestions", debouncedInput],
    queryFn: () => skillsApi.search(debouncedInput),
    enabled: debouncedInput.length > 1,
  });

  const { mutate: add, isPending: adding } = useMutation({
    mutationFn: (name: string) => skillsApi.addSkill(name, proficiency),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-skills"] });
      setInput("");
      setError(null);
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const { mutate: remove } = useMutation({
    mutationFn: (skillId: string) => skillsApi.removeSkill(skillId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-skills"] }),
  });

  const handleAdd = (name: string) => {
    if (!name.trim()) return;
    add(name.trim());
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : mySkills?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No skills added yet.</p>
        ) : (
          mySkills?.map((us) => (
            <span
              key={us.id}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                us.proficiency ? PROFICIENCY_COLORS[us.proficiency] : "bg-secondary text-secondary-foreground"
              )}
            >
              {us.skill.name}
              {us.proficiency && <span className="opacity-60">· {us.proficiency[0]}</span>}
              <button onClick={() => remove(us.skill.id)} className="hover:opacity-70 transition-opacity ml-0.5">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))
        )}
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <input
            className="w-full h-8 px-3 text-sm rounded-md border bg-background focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12"
            placeholder="Add a skill (e.g. Python)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd(input))}
          />
          {suggestions && suggestions.length > 0 && input.length > 1 && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-xl border bg-card shadow-lg z-20 py-1 max-h-40 overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                  onClick={() => { setInput(s.name); handleAdd(s.name); }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <select
          value={proficiency}
          onChange={(e) => {
            const value = e.target.value;
            if (value === "beginner" || value === "intermediate" || value === "expert") setProficiency(value);
          }}
          className="h-8 px-2 text-xs rounded-md border bg-background focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12"
        >
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="expert">Expert</option>
        </select>
        <button
          onClick={() => handleAdd(input)}
          disabled={!input.trim() || adding}
          className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1"
        >
          {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Add
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Project skills display ────────────────────────────────────────────────────

export function ProjectSkillTags({ skills }: { skills: ProjectSkillRead[] }) {
  if (!skills?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {skills.map((ps) => (
        <span
          key={ps.id}
          className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
            ps.is_required
              ? "bg-primary/10 text-primary border border-primary/20"
              : "bg-secondary text-secondary-foreground"
          )}
        >
          {ps.skill.name}
          {ps.is_required && <span className="ml-1 text-[9px] opacity-60">required</span>}
        </span>
      ))}
    </div>
  );
}

// ── Project skills manager (for owners) ──────────────────────────────────────

export function ProjectSkillsManager({ projectId }: { projectId: string }) {
  const [input, setInput] = useState("");
  const [isRequired, setIsRequired] = useState(true);
  const qc = useQueryClient();

  const { data: skills } = useQuery({
    queryKey: ["project-skills", projectId],
    queryFn: () => skillsApi.projectSkills(projectId),
  });

  const { mutate: add, isPending } = useMutation({
    mutationFn: (name: string) => skillsApi.addProjectSkill(projectId, name, isRequired),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-skills", projectId] }); setInput(""); },
  });

  const { mutate: remove } = useMutation({
    mutationFn: (skillId: string) => skillsApi.removeProjectSkill(projectId, skillId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-skills", projectId] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {skills?.map((ps) => (
          <span key={ps.id} className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
            ps.is_required ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"
          )}>
            {ps.skill.name}
            <button onClick={() => remove(ps.skill.id)} className="hover:opacity-70">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <input
          className="h-8 px-3 text-sm rounded-md border bg-background focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12 flex-1 min-w-[140px]"
          placeholder="Required skill (e.g. React)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), input.trim() && add(input.trim()))}
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} className="w-3.5 h-3.5" />
          Required
        </label>
        <button
          onClick={() => input.trim() && add(input.trim())}
          disabled={!input.trim() || isPending}
          className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
