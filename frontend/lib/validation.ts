import { z } from "zod";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { getErrorMessage, getFieldErrors } from "@/lib/api/client";

/**
 * Client-side password policy. Must stay in step with
 * `backend/app/core/validators.py::validate_password_strength` so the form
 * never accepts something the API will reject.
 */
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "passw0rd", "p@ssword",
  "12345678", "123456789", "1234567890", "qwerty123", "qwertyui",
  "iloveyou", "welcome1", "admin123", "letmein1", "abc12345",
  "football", "baseball", "sunshine", "princess", "dragon123",
  "monkey123", "trustno1", "asdfghjk", "zxcvbnm1", "changeme",
  "codebazaar", "india123", "student1",
]);

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128, "Use 128 characters or fewer")
  .refine((v) => v === v.trim(), "Cannot start or end with a space")
  .refine((v) => /[A-Za-z]/.test(v), "Include at least one letter")
  .refine((v) => /\d/.test(v), "Include at least one number")
  .refine((v) => new Set(v).size >= 4, "Too repetitive — use a more varied mix")
  .refine(
    (v) => !COMMON_PASSWORDS.has(v.toLowerCase()),
    "Too common — pick something less predictable"
  );

export const emailSchema = z
  .string()
  .min(1, "Email required")
  .email("Enter a valid email address")
  .transform((v) => v.trim().toLowerCase());

export const displayNameSchema = z
  .string()
  .min(1, "Name required")
  .max(120, "Use 120 characters or fewer")
  .transform((v) => v.replace(/\s+/g, " ").trim())
  .refine((v) => v.length > 0, "Name cannot be blank");

/**
 * Attach API validation errors to the matching form fields, and return anything
 * that could not be mapped so the caller can show it in a general alert.
 *
 * Turns a bare "Request failed with status code 409" into an inline message
 * under the offending input.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly Path<T>[]
): string | null {
  const fields = getFieldErrors(err);
  const entries = Object.entries(fields);

  if (entries.length === 0) return getErrorMessage(err);

  let unmapped: string | null = null;
  for (const [name, message] of entries) {
    if ((knownFields as readonly string[]).includes(name)) {
      setError(name as Path<T>, { type: "server", message });
    } else if (!unmapped) {
      unmapped = message;
    }
  }
  return unmapped;
}

/**
 * Conflict (409) responses are not field-shaped, but they almost always refer
 * to one specific input — e.g. an email already registered. Map by keyword so
 * the message lands next to the right field.
 */
export function conflictFieldFor(message: string): string | null {
  const m = message.toLowerCase();
  if (m.includes("email")) return "email";
  if (m.includes("referral")) return "referral_code";
  if (m.includes("repository") || m.includes("repo")) return "repo_full_name";
  return null;
}
