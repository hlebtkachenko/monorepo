"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { useTranslations } from "@workspace/i18n/client"
import { ProfileSchema, type ProfileInput } from "@workspace/shared/auth"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
import { ImageCropper } from "@workspace/ui/components/image-cropper"
import { Input } from "@workspace/ui/components/input"
import {
  PhoneInput,
  PhoneInputCountry,
  PhoneInputField,
} from "@workspace/ui/components/input-phone"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Text } from "@workspace/ui/components/text"
import {
  Pencil,
  Trash2Icon,
  UploadIcon,
  UserIcon,
} from "@workspace/ui/lib/icons"

import { submitProfileAction } from "../actions"
import { clearCarriedAvatar, storeCarriedAvatar } from "../_lib/avatar-carry"

type SupportedLocale = "en"
const SUPPORTED_LOCALES: ReadonlyArray<{
  value: SupportedLocale
  label: string
}> = [{ value: "en", label: "English" }]

const AVATAR_MAX_BYTES = 5 * 1024 * 1024 // 5 MB cap, enforced silently (not surfaced in copy)

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

function listTimezones(): string[] {
  try {
    const intl = Intl as unknown as {
      supportedValuesOf?: (k: string) => string[]
    }
    return intl.supportedValuesOf?.("timeZone") ?? ["UTC"]
  } catch {
    return ["UTC"]
  }
}

interface Props {
  initial?: Partial<ProfileInput>
  /**
   * Presigned GET URL for an avatar the user already uploaded (resolved
   * server-side from the stored S3 key). Shown until the user crops a new
   * image this session.
   */
  initialAvatarUrl?: string | null
}

export function ProfileForm({ initial, initialAvatarUrl }: Props) {
  const router = useRouter()
  const t = useTranslations("onboarding.profile")
  const tBrand = useTranslations("brand")
  const tValidation = useTranslations("auth.validation")
  const tErrors = useTranslations("onboarding.errors")

  const defaultTimezone = useMemo(detectTimezone, [])
  const timezones = useMemo(listTimezones, [])

  const form = useForm<ProfileInput>({
    resolver: zodResolver(ProfileSchema),
    defaultValues: {
      firstName: initial?.firstName ?? "",
      lastName: initial?.lastName ?? "",
      phone: initial?.phone ?? "",
      locale: initial?.locale ?? SUPPORTED_LOCALES[0]!.value,
      timezone: initial?.timezone ?? defaultTimezone,
    },
    mode: "onSubmit",
  })

  const [serverError, setServerError] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  // Original picked file, kept after cropping so the user can re-crop
  // via the edit-on-hover control without re-uploading.
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  // Cropped image bytes — this is what gets uploaded on submit.
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null)
  // When true, the server-side avatar should be deleted on submit.
  const [removeServerAvatar, setRemoveServerAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Revoke object URLs on unmount to avoid memory leaks.
  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    }
  }, [avatarPreview])

  // The freshly-cropped local blob wins; otherwise fall back to the avatar
  // already stored for this user (presigned URL passed from the server).
  // When the user has requested removal, treat both as absent.
  const displayedAvatarUrl =
    avatarPreview ?? (removeServerAvatar ? null : (initialAvatarUrl ?? null))

  function translate(msg: string | undefined): string | undefined {
    if (!msg) return undefined
    if (
      msg.startsWith("name.") ||
      msg.startsWith("phone.") ||
      msg.startsWith("email.")
    ) {
      return tValidation(msg as Parameters<typeof tValidation>[0])
    }
    return msg
  }

  function clearAvatarState() {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarPreview(null)
    setSourceFile(null)
    setCroppedBlob(null)
    setCropFile(null)
    setAvatarError(null)
  }

  function handleAvatarRemove() {
    clearAvatarState()
    if (initialAvatarUrl) {
      setRemoveServerAvatar(true)
    }
  }

  function handleAvatarPick() {
    fileInputRef.current?.click()
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset the input so picking the same file again still fires onChange.
    e.target.value = ""
    if (!file) return
    setAvatarError(null)
    setRemoveServerAvatar(false)
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarError(t("avatarTooLarge"))
      return
    }
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      setAvatarError(t("avatarWrongType"))
      return
    }
    // Keep the original file so the user can re-crop later via the
    // edit-on-hover control; hand it to the cropper now.
    setSourceFile(file)
    setCropFile(file)
  }

  function handleCropComplete(blob: Blob) {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarPreview(URL.createObjectURL(blob))
    // Hold the cropped bytes so onSubmit can upload them.
    setCroppedBlob(blob)
    setCropFile(null)
  }

  async function onSubmit(values: ProfileInput) {
    setServerError(null)
    const result = await submitProfileAction(values)
    if (!result.ok) {
      setServerError(
        tErrors(
          (result.errorKey ?? "saveProfileFailed") as Parameters<
            typeof tErrors
          >[0],
        ),
      )
      return
    }

    // If the user asked to remove a server-side avatar, send the DELETE first.
    // Only fires when a session exists (401 = no session, skip silently since
    // there is no avatar on the server yet in fresh onboarding).
    if (removeServerAvatar) {
      try {
        const res = await fetch("/api/upload/avatar", { method: "DELETE" })
        if (!res.ok && res.status !== 401) {
          setServerError(tErrors("uploadAvatarFailed"))
          return
        }
      } catch {
        setServerError(tErrors("uploadAvatarFailed"))
        return
      }
    }

    // Persist the avatar after the profile saved. During fresh onboarding the
    // Better Auth account does not exist until the password step, so the
    // authenticated upload route 401s here — carry the cropped image in
    // sessionStorage and let the password step upload it once the account
    // exists. When a session already exists (resume / authenticated edit) the
    // immediate upload below succeeds and the carried copy is dropped.
    if (croppedBlob) {
      await storeCarriedAvatar(croppedBlob)
      const ext = croppedBlob.type === "image/png" ? "png" : "jpg"
      const body = new FormData()
      body.append("file", croppedBlob, `avatar.${ext}`)
      try {
        const res = await fetch("/api/upload/avatar", {
          method: "POST",
          body,
        })
        if (res.ok) {
          // Uploaded now (session present) — drop the carry so the password
          // step does not re-upload it.
          clearCarriedAvatar()
        } else if (res.status !== 401) {
          // 401 is expected during fresh onboarding (no session yet); the
          // sessionStorage copy carries it forward. Any other status is a
          // real failure worth surfacing.
          setServerError(tErrors("uploadAvatarFailed"))
          return
        }
      } catch {
        setServerError(tErrors("uploadAvatarFailed"))
        return
      }
    }

    router.push("/onboarding/experience")
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0">
          {t("title")}
        </Heading>
        <Text variant="muted">
          {t("description", { brand: tBrand("name") })}
        </Text>
      </header>

      <form
        onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
        className="flex flex-col gap-5"
        noValidate
      >
        <div className="flex items-center gap-4">
          <div className="group relative size-16 shrink-0">
            <Avatar className="size-16">
              {displayedAvatarUrl ? (
                <AvatarImage src={displayedAvatarUrl} alt={t("avatarLabel")} />
              ) : null}
              <AvatarFallback>
                <UserIcon className="size-9" aria-hidden="true" />
              </AvatarFallback>
            </Avatar>
            {avatarPreview && sourceFile && (
              <button
                type="button"
                onClick={() => setCropFile(sourceFile)}
                aria-label={t("avatarEdit")}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Pencil className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAvatarPick}
              >
                <UploadIcon className="size-3.5" aria-hidden="true" />
                {t("avatarUpload")}
              </Button>
              {displayedAvatarUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAvatarRemove}
                >
                  <Trash2Icon className="size-3.5" aria-hidden="true" />
                  {t("avatarRemove")}
                </Button>
              )}
            </div>
            <Text variant="small" className="text-muted-foreground">
              {avatarError ?? t("avatarHint")}
            </Text>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              aria-label={t("avatarLabel")}
              onChange={handleAvatarChange}
            />
          </div>
        </div>

        <ImageCropper
          open={cropFile !== null}
          file={cropFile}
          cropShape="round"
          onCancel={() => setCropFile(null)}
          onCropComplete={handleCropComplete}
          onRemove={clearAvatarState}
        />

        <FieldGroup>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              data-invalid={
                form.formState.errors.firstName ? "true" : undefined
              }
            >
              <FieldLabel htmlFor="firstName">{t("firstName")}</FieldLabel>
              <Input
                id="firstName"
                inputSize="xl"
                autoComplete="given-name"
                placeholder={t("firstNamePlaceholder")}
                autoFocus
                {...form.register("firstName")}
                aria-invalid={!!form.formState.errors.firstName}
              />
              {form.formState.errors.firstName && (
                <FieldError>
                  {translate(form.formState.errors.firstName.message)}
                </FieldError>
              )}
            </Field>
            <Field
              data-invalid={form.formState.errors.lastName ? "true" : undefined}
            >
              <FieldLabel htmlFor="lastName">{t("lastName")}</FieldLabel>
              <Input
                id="lastName"
                inputSize="xl"
                autoComplete="family-name"
                placeholder={t("lastNamePlaceholder")}
                {...form.register("lastName")}
                aria-invalid={!!form.formState.errors.lastName}
              />
              {form.formState.errors.lastName && (
                <FieldError>
                  {translate(form.formState.errors.lastName.message)}
                </FieldError>
              )}
            </Field>
          </div>

          <Field
            data-invalid={form.formState.errors.phone ? "true" : undefined}
          >
            <FieldLabel htmlFor="phone">{t("phone")}</FieldLabel>
            <Controller
              name="phone"
              control={form.control}
              render={({ field }) => (
                <PhoneInput
                  id="phone"
                  defaultCountry="CZ"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v)}
                  invalid={!!form.formState.errors.phone}
                  className="h-11"
                >
                  <PhoneInputCountry />
                  <PhoneInputField
                    autoComplete="tel"
                    placeholder={t("phonePlaceholder")}
                    onBlur={field.onBlur}
                    aria-invalid={!!form.formState.errors.phone}
                  />
                </PhoneInput>
              )}
            />
            <FieldDescription>{t("phoneHint")}</FieldDescription>
            {form.formState.errors.phone && (
              <FieldError>
                {translate(form.formState.errors.phone.message)}
              </FieldError>
            )}
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="locale">{t("locale")}</FieldLabel>
              <Select
                value={form.watch("locale")}
                onValueChange={(v) => form.setValue("locale", v)}
              >
                <SelectTrigger id="locale">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LOCALES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="timezone">{t("timezone")}</FieldLabel>
              <Select
                value={form.watch("timezone")}
                onValueChange={(v) => form.setValue("timezone", v)}
              >
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezones.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </FieldGroup>

        {serverError && (
          <Text variant="small" className="text-destructive" role="alert">
            {serverError}
          </Text>
        )}

        <Button type="submit" size="xl" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t("submitting") : t("submit")}
        </Button>
      </form>
    </div>
  )
}
