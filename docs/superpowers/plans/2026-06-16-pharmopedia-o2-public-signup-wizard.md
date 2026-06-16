# Pharmopedia O2 — Public Signup Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public path (`register.tsx`) as a premium multi-step signup wizard (phone → OTP → name → optional photo → current address) that persists a self-owned profile to Supabase `user_metadata` + a `profile-photos` Storage bucket.

**Architecture:** A `register.tsx` wizard host drives a `step` state machine on the O1 `AuthShell`, with small focused components: a reusable `PickerField` (province/district), `PhotoPicker` (expo-image-picker), `WizardProgress`, and a `uploadProfilePhoto` lib. Province/district data comes from `@ultranos/shared-types`. No `patients` row (claim is O3).

**Tech Stack:** Expo Router, React Native, Supabase Auth + Storage, expo-image-picker, `@ultranos/shared-types` (AFGHAN_PROVINCES/getDistrictsByProvince), `@ultranos/ui-kit/native` (Button), Vitest.

**Conventions (keep):** tokens-only; theme via `useThemeColors`; RTL via `isRtlLang`; icons from `lucide-react-native`; built on `AuthShell`. **Commits:** repo forbids autonomous commits — run `Commit` steps only on the user's go-ahead, with the `Co-Authored-By` trailer. **Backend note:** Task 1's Storage bucket is created via the Supabase MCP `apply_migration`; the controller runs that step (subagents can't be relied on for MCP infra).

---

## File Structure

**Created:**
- `apps/pharmopedia/src/lib/profile-photo.ts` — `uploadProfilePhoto(uri, userId)`.
- `apps/pharmopedia/src/components/signup/PickerField.tsx` — reusable searchable modal picker.
- `apps/pharmopedia/src/components/signup/ProvincePicker.tsx`, `DistrictPicker.tsx` — thin wrappers over `PickerField` + shared-types data.
- `apps/pharmopedia/src/components/signup/PhotoPicker.tsx` — image-picker + preview + skip.
- `apps/pharmopedia/src/components/signup/WizardProgress.tsx` — "Step N of M".
- `apps/pharmopedia/src/__mocks__/expo-image-picker.js` — Vitest mock.
- Tests: `src/__tests__/picker-field.test.tsx`, `address-pickers.test.tsx`, `photo-picker.test.tsx`, `profile-photo.test.ts`, `signup-wizard.test.tsx`.

**Modified:**
- `apps/pharmopedia/app/(auth)/register.tsx` — rebuilt as the wizard host.
- `apps/pharmopedia/package.json` — add `expo-image-picker`.
- `apps/pharmopedia/app.config.ts` — image-picker plugin + permission strings.
- `apps/pharmopedia/vitest.config.ts` — alias `expo-image-picker` → mock.
- `apps/pharmopedia/src/i18n/locales/{en,prs,ps,ar}.ts` — `signup` namespace.

---

## Task 1: Backend + deps + mock (controller-run)

**Files:**
- Modify: `apps/pharmopedia/package.json`, `apps/pharmopedia/app.config.ts`, `apps/pharmopedia/vitest.config.ts`
- Create: `apps/pharmopedia/src/__mocks__/expo-image-picker.js`
- Backend: Supabase `profile-photos` bucket + policies (via Supabase MCP)

- [ ] **Step 1: Create the Storage bucket + RLS (Supabase MCP `apply_migration`, name `o2_profile_photos_bucket`)**

```sql
insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do nothing;

-- Owners may write/update/delete only under their own {uid}/ prefix; read is public (bucket public=true).
create policy "profile-photos owner insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "profile-photos owner update"
  on storage.objects for update to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "profile-photos owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
```
Verify with `list_tables`/a `select` that the bucket row exists. (Avatars are non-PHI; public-read keeps display simple and offline-tolerant.)

- [ ] **Step 2: Add the dependency**

In `apps/pharmopedia/package.json` `dependencies`, add: `"expo-image-picker": "~17.0.0",` then run `pnpm install`. (If install resolves a different Expo-54-compatible patch, accept it.)

- [ ] **Step 3: Configure the plugin + permissions in `app.config.ts`**

Add to the `plugins` array:
```ts
['expo-image-picker', { photosPermission: 'Allow Pharmopedia to use your photos for your profile picture.', cameraPermission: 'Allow Pharmopedia to use your camera for your profile picture.' }],
```

- [ ] **Step 4: Create the Vitest mock**

Create `apps/pharmopedia/src/__mocks__/expo-image-picker.js`:
```js
module.exports = {
  MediaTypeOptions: { Images: 'Images' },
  requestMediaLibraryPermissionsAsync: async () => ({ status: 'granted', granted: true }),
  requestCameraPermissionsAsync: async () => ({ status: 'granted', granted: true }),
  launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///mock/photo.jpg' }] }),
  launchCameraAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///mock/photo.jpg' }] }),
}
```
And add to `apps/pharmopedia/vitest.config.ts` `resolve.alias`:
```ts
      'expo-image-picker': path.resolve(__dirname, 'src/__mocks__/expo-image-picker.js'),
```

- [ ] **Step 5: Sanity check**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native 2>&1 | grep -E "Test Files|Tests "`
Expected: still 12 files / 41 tests pass (no regression from config/dep changes).

- [ ] **Step 6: Commit**
```bash
git add apps/pharmopedia/package.json apps/pharmopedia/app.config.ts apps/pharmopedia/vitest.config.ts apps/pharmopedia/src/__mocks__/expo-image-picker.js pnpm-lock.yaml
git commit -m "chore(pharmopedia): expo-image-picker + profile-photos bucket for signup"
```

---

## Task 2: i18n `signup` namespace

**Files:**
- Modify: `apps/pharmopedia/src/i18n/locales/{en,prs,ps,ar}.ts`

- [ ] **Step 1: Add a `signup` block to each locale (same position in all four)**

`en.ts`:
```ts
  signup: {
    stepOf: 'Step {{n}} of {{total}}',
    phoneTitle: 'What’s your phone number?',
    phoneSubtitle: 'We’ll text you a verification code.',
    codeTitle: 'Enter your code',
    nameTitle: 'Your name',
    givenName: 'First name',
    familyName: 'Last name',
    photoTitle: 'Add a profile photo',
    photoSubtitle: 'Optional — you can add this later.',
    choosePhoto: 'Choose from library',
    takePhoto: 'Take a photo',
    removePhoto: 'Remove',
    skip: 'Skip',
    addressTitle: 'Where do you live?',
    province: 'Province',
    district: 'District',
    village: 'Village (optional)',
    provincePlaceholder: 'Select a province',
    districtPlaceholder: 'Select a district',
    searchPlaceholder: 'Search…',
    continue: 'Continue',
    finish: 'Create account',
    nameRequired: 'Please enter your first and last name.',
    addressRequired: 'Please select your province and district.',
    saveError: 'Couldn’t save your profile. Please try again.',
  },
```
`prs.ts`:
```ts
  signup: {
    stepOf: 'مرحله {{n}} از {{total}}',
    phoneTitle: 'شماره تلفن شما چیست؟',
    phoneSubtitle: 'یک کد تأیید برایتان ارسال می‌کنیم.',
    codeTitle: 'کد خود را وارد کنید',
    nameTitle: 'نام شما',
    givenName: 'نام',
    familyName: 'تخلص',
    photoTitle: 'عکس پروفایل اضافه کنید',
    photoSubtitle: 'اختیاری — بعداً هم می‌توانید اضافه کنید.',
    choosePhoto: 'انتخاب از گالری',
    takePhoto: 'گرفتن عکس',
    removePhoto: 'حذف',
    skip: 'رد کردن',
    addressTitle: 'کجا زندگی می‌کنید؟',
    province: 'ولایت',
    district: 'ولسوالی',
    village: 'قریه (اختیاری)',
    provincePlaceholder: 'ولایت را انتخاب کنید',
    districtPlaceholder: 'ولسوالی را انتخاب کنید',
    searchPlaceholder: 'جستجو…',
    continue: 'ادامه',
    finish: 'ایجاد حساب',
    nameRequired: 'لطفاً نام و تخلص خود را وارد کنید.',
    addressRequired: 'لطفاً ولایت و ولسوالی خود را انتخاب کنید.',
    saveError: 'ذخیره پروفایل ناکام شد. لطفاً دوباره تلاش کنید.',
  },
```
`ps.ts`:
```ts
  signup: {
    stepOf: 'پړاو {{n}} د {{total}} څخه',
    phoneTitle: 'ستاسو د تلیفون شمیره څه ده؟',
    phoneSubtitle: 'موږ به تاسو ته د تایید کوډ واستوو.',
    codeTitle: 'خپل کوډ دننه کړئ',
    nameTitle: 'ستاسو نوم',
    givenName: 'نوم',
    familyName: 'تخلص',
    photoTitle: 'د پروفایل عکس اضافه کړئ',
    photoSubtitle: 'اختیاري — وروسته یې هم اضافه کولی شئ.',
    choosePhoto: 'له ګالري څخه وټاکئ',
    takePhoto: 'عکس واخلئ',
    removePhoto: 'لرې کول',
    skip: 'پرېښودل',
    addressTitle: 'چیرته اوسېږئ؟',
    province: 'ولایت',
    district: 'ولسوالۍ',
    village: 'کلی (اختیاري)',
    provincePlaceholder: 'ولایت وټاکئ',
    districtPlaceholder: 'ولسوالۍ وټاکئ',
    searchPlaceholder: 'لټون…',
    continue: 'دوام',
    finish: 'حساب جوړ کړئ',
    nameRequired: 'مهرباني وکړئ خپل نوم او تخلص دننه کړئ.',
    addressRequired: 'مهرباني وکړئ خپل ولایت او ولسوالۍ وټاکئ.',
    saveError: 'د پروفایل ساتل ناکام شول. بیا هڅه وکړئ.',
  },
```
`ar.ts`:
```ts
  signup: {
    stepOf: 'الخطوة {{n}} من {{total}}',
    phoneTitle: 'ما هو رقم هاتفك؟',
    phoneSubtitle: 'سنرسل لك رمز تحقق عبر رسالة نصية.',
    codeTitle: 'أدخل الرمز',
    nameTitle: 'اسمك',
    givenName: 'الاسم الأول',
    familyName: 'اسم العائلة',
    photoTitle: 'أضف صورة الملف الشخصي',
    photoSubtitle: 'اختياري — يمكنك إضافتها لاحقًا.',
    choosePhoto: 'اختر من المعرض',
    takePhoto: 'التقط صورة',
    removePhoto: 'إزالة',
    skip: 'تخطّي',
    addressTitle: 'أين تقيم؟',
    province: 'الولاية',
    district: 'المنطقة',
    village: 'القرية (اختياري)',
    provincePlaceholder: 'اختر الولاية',
    districtPlaceholder: 'اختر المنطقة',
    searchPlaceholder: 'بحث…',
    continue: 'متابعة',
    finish: 'إنشاء حساب',
    nameRequired: 'يرجى إدخال اسمك الأول واسم العائلة.',
    addressRequired: 'يرجى اختيار الولاية والمنطقة.',
    saveError: 'تعذّر حفظ ملفك الشخصي. حاول مرة أخرى.',
  },
```

- [ ] **Step 2: Typecheck parity**

Run: `pnpm --filter @ultranos/pharmopedia typecheck 2>&1 | grep -E "locales/(prs|ps|ar)\.ts" | grep -i "signup" | head`
Expected: empty (no missing-key errors for the `signup` block).

- [ ] **Step 3: Commit**
```bash
git add apps/pharmopedia/src/i18n/locales
git commit -m "i18n(pharmopedia): signup wizard namespace"
```

---

## Task 3: PickerField + Province/District pickers

**Files:**
- Create: `apps/pharmopedia/src/components/signup/PickerField.tsx`, `ProvincePicker.tsx`, `DistrictPicker.tsx`
- Test: `apps/pharmopedia/src/__tests__/picker-field.test.tsx`, `address-pickers.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/pharmopedia/src/__tests__/picker-field.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'
import { PickerField } from '@/components/signup/PickerField'

vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({ surface: '#fff', surfaceSubtle: '#f3f4f6', textPrimary: '#111', textSecondary: '#555', textMuted: '#999', primary500: '#2e9e71', border: '#e5e5e5', white: '#fff', overlay: 'rgba(0,0,0,0.5)' }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

describe('PickerField', () => {
  it('shows the placeholder when no value, and the value when set', () => {
    const { getByTestId, rerender } = render(<PickerField testID="pf" label="Province" placeholder="Select" value="" options={['Kabul', 'Herat']} onSelect={() => {}} />)
    expect(getByTestId('pf-value').props.children).toBe('Select')
    rerender(<PickerField testID="pf" label="Province" placeholder="Select" value="Kabul" options={['Kabul', 'Herat']} onSelect={() => {}} />)
    expect(getByTestId('pf-value').props.children).toBe('Kabul')
  })

  it('opens the modal and selects an option', () => {
    const onSelect = vi.fn()
    const { getByTestId, getByText } = render(<PickerField testID="pf" label="Province" placeholder="Select" value="" options={['Kabul', 'Herat']} onSelect={onSelect} />)
    fireEvent.press(getByTestId('pf-trigger'))
    fireEvent.press(getByText('Herat'))
    expect(onSelect).toHaveBeenCalledWith('Herat')
  })

  it('does not open when disabled', () => {
    const { getByTestId, queryByText } = render(<PickerField testID="pf" label="District" placeholder="Select" value="" options={['A']} onSelect={() => {}} disabled />)
    fireEvent.press(getByTestId('pf-trigger'))
    expect(queryByText('A')).toBeNull()
  })
})
```

Create `apps/pharmopedia/src/__tests__/address-pickers.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'
import { ProvincePicker } from '@/components/signup/ProvincePicker'
import { DistrictPicker } from '@/components/signup/DistrictPicker'

vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({ surface: '#fff', surfaceSubtle: '#f3f4f6', textPrimary: '#111', textSecondary: '#555', textMuted: '#999', primary500: '#2e9e71', border: '#e5e5e5', white: '#fff', overlay: 'rgba(0,0,0,0.5)' }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

describe('Address pickers', () => {
  it('province picker lists provinces and selects one', () => {
    const onChange = vi.fn()
    const { getByTestId, getByText } = render(<ProvincePicker value="" onChange={onChange} />)
    fireEvent.press(getByTestId('province-picker-trigger'))
    fireEvent.press(getByText('Kabul'))
    expect(onChange).toHaveBeenCalledWith('Kabul')
  })

  it('district picker is disabled without a province and lists that province’s districts when set', () => {
    const onChange = vi.fn()
    const { getByTestId, getByText, rerender } = render(<DistrictPicker province="" value="" onChange={onChange} />)
    fireEvent.press(getByTestId('district-picker-trigger'))
    // disabled: nothing opens — re-render with a province and select
    rerender(<DistrictPicker province="Kabul" value="" onChange={onChange} />)
    fireEvent.press(getByTestId('district-picker-trigger'))
    // Kabul has districts; pick the first rendered option by its known name
    expect(getByText('Kabul')).toBeTruthy() // Kabul province includes a "Kabul" district
    fireEvent.press(getByText('Kabul'))
    expect(onChange).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/picker-field.test.tsx src/__tests__/address-pickers.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement PickerField**

Create `apps/pharmopedia/src/components/signup/PickerField.tsx`:
```tsx
import { useState } from 'react'
import { View, Text, Pressable, Modal, FlatList, TextInput, StyleSheet } from 'react-native'
import { ChevronDown, X } from 'lucide-react-native'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTranslation } from 'react-i18next'

interface Props {
  label: string
  placeholder: string
  value: string
  options: string[]
  onSelect: (value: string) => void
  disabled?: boolean
  testID?: string
}

export function PickerField({ label, placeholder, value, options, onSelect, disabled, testID }: Props) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const filtered = query ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase())) : options

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <Pressable
        testID={testID ? `${testID}-trigger` : undefined}
        onPress={() => { if (!disabled) setOpen(true) }}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
        style={[styles.trigger, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }, disabled && styles.disabled]}
      >
        <Text testID={testID ? `${testID}-value` : undefined} style={[styles.value, { color: value ? colors.textPrimary : colors.textMuted }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <ChevronDown size={18} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{label}</Text>
            <Pressable testID={testID ? `${testID}-close` : undefined} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
              <X size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <TextInput
            style={[styles.search, { backgroundColor: colors.surfaceSubtle, color: colors.textPrimary }]}
            placeholder={t('signup.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { onSelect(item); setOpen(false); setQuery('') }}
                accessibilityRole="button"
                style={[styles.option, { borderBottomColor: colors.borderSubtle ?? colors.border }]}
              >
                <Text style={[styles.optionText, { color: colors.textPrimary }]}>{item}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  field: { gap: Spacing[1] },
  label: { fontFamily: FontFamily.sansMedium, fontSize: FontSize.sm },
  trigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[3], minHeight: 48 },
  disabled: { opacity: 0.5 },
  value: { flex: 1, fontFamily: FontFamily.sans, fontSize: FontSize.base },
  sheet: { flex: 1, marginTop: Spacing[16], borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing[4], gap: Spacing[3] },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontFamily: FontFamily.headingBold, fontSize: FontSize.lg },
  search: { borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[3], fontFamily: FontFamily.sans, fontSize: FontSize.base },
  option: { paddingVertical: Spacing[3], borderBottomWidth: StyleSheet.hairlineWidth },
  optionText: { fontFamily: FontFamily.sans, fontSize: FontSize.base },
})
```

- [ ] **Step 4: Implement ProvincePicker + DistrictPicker**

Create `apps/pharmopedia/src/components/signup/ProvincePicker.tsx`:
```tsx
import { useTranslation } from 'react-i18next'
import { AFGHAN_PROVINCES, type AfghanProvince } from '@ultranos/shared-types'
import { PickerField } from './PickerField'

export function ProvincePicker({ value, onChange }: { value: string; onChange: (p: AfghanProvince) => void }) {
  const { t } = useTranslation()
  return (
    <PickerField
      testID="province-picker"
      label={t('signup.province')}
      placeholder={t('signup.provincePlaceholder')}
      value={value}
      options={[...AFGHAN_PROVINCES]}
      onSelect={(v) => onChange(v as AfghanProvince)}
    />
  )
}
```

Create `apps/pharmopedia/src/components/signup/DistrictPicker.tsx`:
```tsx
import { useTranslation } from 'react-i18next'
import { getDistrictsByProvince, type AfghanProvince } from '@ultranos/shared-types'
import { PickerField } from './PickerField'

export function DistrictPicker({ province, value, onChange }: { province: string; value: string; onChange: (d: string) => void }) {
  const { t } = useTranslation()
  const options = province ? getDistrictsByProvince(province as AfghanProvince).map((d) => d.name) : []
  return (
    <PickerField
      testID="district-picker"
      label={t('signup.district')}
      placeholder={t('signup.districtPlaceholder')}
      value={value}
      options={options}
      onSelect={onChange}
      disabled={!province}
    />
  )
}
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/picker-field.test.tsx src/__tests__/address-pickers.test.tsx`
Expected: PASS. (If the FlatList mock doesn't render items, confirm the existing react-native mock's `FlatList` maps `data`/`renderItem` — it does; items render as children.)

- [ ] **Step 6: Commit**
```bash
git add apps/pharmopedia/src/components/signup/PickerField.tsx apps/pharmopedia/src/components/signup/ProvincePicker.tsx apps/pharmopedia/src/components/signup/DistrictPicker.tsx apps/pharmopedia/src/__tests__/picker-field.test.tsx apps/pharmopedia/src/__tests__/address-pickers.test.tsx
git commit -m "feat(pharmopedia): province/district pickers for signup"
```

---

## Task 4: PhotoPicker

**Files:**
- Create: `apps/pharmopedia/src/components/signup/PhotoPicker.tsx`
- Test: `apps/pharmopedia/src/__tests__/photo-picker.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/photo-picker.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { PhotoPicker } from '@/components/signup/PhotoPicker'

vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({ surface: '#fff', surfaceSubtle: '#f3f4f6', textPrimary: '#111', textSecondary: '#555', textMuted: '#999', primary500: '#2e9e71', primary50: '#edfaf4', primary600: '#237d5a', border: '#e5e5e5', white: '#fff' }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

describe('PhotoPicker', () => {
  it('calls onChange with a uri after choosing from library', async () => {
    const onChange = vi.fn()
    const { getByTestId } = render(<PhotoPicker value={null} onChange={onChange} />)
    fireEvent.press(getByTestId('photo-choose'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('file:///mock/photo.jpg'))
  })

  it('shows a remove control when a photo is set and clears it', () => {
    const onChange = vi.fn()
    const { getByTestId } = render(<PhotoPicker value="file:///mock/photo.jpg" onChange={onChange} />)
    fireEvent.press(getByTestId('photo-remove'))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/photo-picker.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement PhotoPicker**

Create `apps/pharmopedia/src/components/signup/PhotoPicker.tsx`:
```tsx
import { View, Text, Image, Pressable, StyleSheet } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Camera, ImagePlus, X } from 'lucide-react-native'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTranslation } from 'react-i18next'

export function PhotoPicker({ value, onChange }: { value: string | null; onChange: (uri: string | null) => void }) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  async function pick(from: 'library' | 'camera') {
    if (from === 'library') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) return
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 })
      if (!res.canceled && res.assets[0]) onChange(res.assets[0].uri)
    } else {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (!perm.granted) return
      const res = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 })
      if (!res.canceled && res.assets[0]) onChange(res.assets[0].uri)
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.preview, { backgroundColor: colors.primary50, borderColor: colors.border }]}>
        {value ? (
          <Image testID="photo-preview" source={{ uri: value }} style={styles.previewImg} />
        ) : (
          <ImagePlus size={36} color={colors.primary600} />
        )}
        {value ? (
          <Pressable testID="photo-remove" onPress={() => onChange(null)} accessibilityRole="button" accessibilityLabel={t('signup.removePhoto')} style={[styles.removeBadge, { backgroundColor: colors.surface }]}>
            <X size={16} color={colors.textPrimary} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Pressable testID="photo-choose" onPress={() => void pick('library')} accessibilityRole="button" style={[styles.action, { borderColor: colors.primary500 }]}>
          <ImagePlus size={16} color={colors.primary500} />
          <Text style={[styles.actionText, { color: colors.primary500 }]}>{t('signup.choosePhoto')}</Text>
        </Pressable>
        <Pressable testID="photo-camera" onPress={() => void pick('camera')} accessibilityRole="button" style={[styles.action, { borderColor: colors.primary500 }]}>
          <Camera size={16} color={colors.primary500} />
          <Text style={[styles.actionText, { color: colors.primary500 }]}>{t('signup.takePhoto')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: Spacing[4] },
  preview: { width: 120, height: 120, borderRadius: Radius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  previewImg: { width: '100%', height: '100%' },
  removeBadge: { position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: Spacing[3] },
  action: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2] },
  actionText: { fontFamily: FontFamily.sansSemibold, fontSize: FontSize.sm },
})
```

- [ ] **Step 4: Add lucide mock icons**

In `apps/pharmopedia/src/__mocks__/lucide-react-native.js` add `Camera`, `ImagePlus`, `ChevronDown` consts + exports (X is already present).

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/photo-picker.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**
```bash
git add apps/pharmopedia/src/components/signup/PhotoPicker.tsx apps/pharmopedia/src/__tests__/photo-picker.test.tsx apps/pharmopedia/src/__mocks__/lucide-react-native.js
git commit -m "feat(pharmopedia): profile PhotoPicker (expo-image-picker)"
```

---

## Task 5: uploadProfilePhoto lib

**Files:**
- Create: `apps/pharmopedia/src/lib/profile-photo.ts`
- Test: `apps/pharmopedia/src/__tests__/profile-photo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/profile-photo.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const upload = vi.fn(async () => ({ data: { path: 'u1/avatar.jpg' }, error: null }))
const getPublicUrl = vi.fn(() => ({ data: { publicUrl: 'https://cdn/u1/avatar.jpg' } }))
vi.mock('@/lib/supabase', () => ({ supabase: { storage: { from: () => ({ upload, getPublicUrl }) } } }))
// global fetch returns a blob for the uri
;(globalThis as unknown as { fetch: unknown }).fetch = vi.fn(async () => ({ blob: async () => ({ size: 10, type: 'image/jpeg' }) }))

import { uploadProfilePhoto } from '@/lib/profile-photo'

describe('uploadProfilePhoto', () => {
  beforeEach(() => { upload.mockClear(); getPublicUrl.mockClear() })

  it('uploads to {userId}/avatar.jpg and returns the public url', async () => {
    const url = await uploadProfilePhoto('file:///x/photo.jpg', 'u1')
    expect(upload).toHaveBeenCalled()
    expect(upload.mock.calls[0][0]).toBe('u1/avatar.jpg')
    expect(url).toBe('https://cdn/u1/avatar.jpg')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/profile-photo.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the lib**

Create `apps/pharmopedia/src/lib/profile-photo.ts`:
```ts
import { supabase } from '@/lib/supabase'

const BUCKET = 'profile-photos'

/**
 * Upload a local image URI to the profile-photos bucket at {userId}/avatar.jpg
 * (upsert) and return its public URL. Throws on upload error.
 */
export async function uploadProfilePhoto(uri: string, userId: string): Promise<string> {
  const res = await fetch(uri)
  const blob = await res.blob()
  const path = `${userId}/avatar.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/profile-photo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmopedia/src/lib/profile-photo.ts apps/pharmopedia/src/__tests__/profile-photo.test.ts
git commit -m "feat(pharmopedia): uploadProfilePhoto Storage helper"
```

---

## Task 6: WizardProgress + the signup wizard host

**Files:**
- Create: `apps/pharmopedia/src/components/signup/WizardProgress.tsx`
- Modify (replace): `apps/pharmopedia/app/(auth)/register.tsx`
- Test: `apps/pharmopedia/src/__tests__/signup-wizard.test.tsx`

- [ ] **Step 1: Implement WizardProgress**

Create `apps/pharmopedia/src/components/signup/WizardProgress.tsx`:
```tsx
import { View, Text, StyleSheet } from 'react-native'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTranslation } from 'react-i18next'

export function WizardProgress({ step, total }: { step: number; total: number }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  return (
    <View style={styles.wrap}>
      <View style={[styles.track, { backgroundColor: colors.surfaceSubtle }]}>
        <View testID="wizard-progress-fill" style={[styles.fill, { backgroundColor: colors.primary500, width: `${Math.round((step / total) * 100)}%` }]} />
      </View>
      <Text style={[styles.label, { color: colors.textMuted }]}>{t('signup.stepOf', { n: step, total })}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing[1] },
  track: { height: 6, borderRadius: Radius.full, overflow: 'hidden' },
  fill: { height: 6, borderRadius: Radius.full },
  label: { fontFamily: FontFamily.sans, fontSize: FontSize.xs },
})
```

- [ ] **Step 2: Write the failing wizard test**

Create `apps/pharmopedia/src/__tests__/signup-wizard.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  signInWithOtp: vi.fn(async () => ({ error: null })),
  verifyOtp: vi.fn(async () => ({ data: { session: { access_token: 'tok', user: { id: 'u1', app_metadata: {} } } }, error: null })),
  updateUser: vi.fn(async () => ({ data: {}, error: null })),
  uploadProfilePhoto: vi.fn(async () => 'https://cdn/u1/avatar.jpg'),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k) }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ replace: h.replace }) }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signInWithOtp: h.signInWithOtp, verifyOtp: h.verifyOtp, updateUser: h.updateUser } } }))
vi.mock('@/store/auth-store', () => ({ useAuthStore: (s: (x: { login: () => void }) => unknown) => s({ login: vi.fn() }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string; setLang: () => void }) => unknown) => s({ lang: 'en', setLang: vi.fn() }), isRtlLang: () => false }))
vi.mock('@/lib/profile-photo', () => ({ uploadProfilePhoto: h.uploadProfilePhoto }))
vi.mock('@/components/LanguageChips', () => ({ LanguageChips: () => null }))
vi.mock('@/components/signup/PhotoPicker', () => ({ PhotoPicker: () => null }))
vi.mock('@/components/signup/ProvincePicker', () => ({ ProvincePicker: ({ onChange }: { onChange: (p: string) => void }) => { const { Pressable, Text } = require('react-native'); return <Pressable testID="mock-province" onPress={() => onChange('Kabul')}><Text>province</Text></Pressable> } }))
vi.mock('@/components/signup/DistrictPicker', () => ({ DistrictPicker: ({ onChange }: { onChange: (d: string) => void }) => { const { Pressable, Text } = require('react-native'); return <Pressable testID="mock-district" onPress={() => onChange('Kabul')}><Text>district</Text></Pressable> } }))

import RegisterScreen from '@/app/(auth)/register'

async function press(getByTestId: (id: string) => unknown, id: string) {
  await act(async () => { fireEvent.press(getByTestId(id) as never) })
}

describe('Signup wizard', () => {
  it('walks phone → otp → name → photo(skip) → address → finish and persists profile', async () => {
    const { getByTestId } = render(<RegisterScreen />)
    // Step 1: phone
    fireEvent.changeText(getByTestId('phone-input'), '+93700000000')
    await press(getByTestId, 'wizard-continue')
    await waitFor(() => expect(h.signInWithOtp).toHaveBeenCalled())
    // Step 2: otp
    fireEvent.changeText(getByTestId('otp-input'), '123456')
    await press(getByTestId, 'wizard-continue')
    await waitFor(() => expect(h.verifyOtp).toHaveBeenCalled())
    // Step 3: name
    fireEvent.changeText(getByTestId('given-name-input'), 'Sara')
    fireEvent.changeText(getByTestId('family-name-input'), 'Ahmadi')
    await press(getByTestId, 'wizard-continue')
    // Step 4: photo (skip)
    await press(getByTestId, 'wizard-skip')
    // Step 5: address
    await press(getByTestId, 'mock-province')
    await press(getByTestId, 'mock-district')
    await press(getByTestId, 'wizard-finish')
    await waitFor(() => expect(h.updateUser).toHaveBeenCalled())
    const arg = h.updateUser.mock.calls[0][0] as { data: { given_name: string; family_name: string; address: { province: string; district: string } } }
    expect(arg.data.given_name).toBe('Sara')
    expect(arg.data.family_name).toBe('Ahmadi')
    expect(arg.data.address.province).toBe('Kabul')
    expect(arg.data.address.district).toBe('Kabul')
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/(tabs)'))
  })

  it('blocks Continue on the name step until both names are entered', async () => {
    const { getByTestId, queryByTestId } = render(<RegisterScreen />)
    fireEvent.changeText(getByTestId('phone-input'), '+93700000000')
    await press(getByTestId, 'wizard-continue')
    fireEvent.changeText(getByTestId('otp-input'), '123456')
    await press(getByTestId, 'wizard-continue')
    // On name step now; continue without names should not advance to photo/skip
    await press(getByTestId, 'wizard-continue')
    expect(queryByTestId('wizard-skip')).toBeNull() // still on name step (photo step has the skip control)
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/signup-wizard.test.tsx`
Expected: FAIL — register.tsx is still the old interim screen.

- [ ] **Step 4: Replace `register.tsx` with the wizard host**

Replace `apps/pharmopedia/app/(auth)/register.tsx`:
```tsx
import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth-store'
import { hapticNotification } from '@/lib/haptics'
import { NotificationFeedbackType } from 'expo-haptics'
import { Button } from '@ultranos/ui-kit/native'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { AuthShell } from '@/components/AuthShell'
import { WizardProgress } from '@/components/signup/WizardProgress'
import { PhotoPicker } from '@/components/signup/PhotoPicker'
import { ProvincePicker } from '@/components/signup/ProvincePicker'
import { DistrictPicker } from '@/components/signup/DistrictPicker'
import { uploadProfilePhoto } from '@/lib/profile-photo'

type Step = 'phone' | 'otp' | 'name' | 'photo' | 'address'
const ORDER: Step[] = ['phone', 'otp', 'name', 'photo', 'address']

export default function RegisterScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [given, setGiven] = useState('')
  const [family, setFamily] = useState('')
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [province, setProvince] = useState('')
  const [district, setDistrict] = useState('')
  const [village, setVillage] = useState('')
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stepIndex = ORDER.indexOf(step)

  async function handleSendOtp() {
    setLoading(true); setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({ phone })
    setLoading(false)
    if (err) { setError(err.message); void hapticNotification(NotificationFeedbackType.Error); return }
    setStep('otp')
  }

  async function handleVerifyOtp() {
    setLoading(true); setError(null)
    const { data, error: err } = await supabase.auth.verifyOtp({ phone, token: otp, type: 'sms' })
    setLoading(false)
    if (err || !data.session) { setError(err?.message ?? t('signup.saveError')); void hapticNotification(NotificationFeedbackType.Error); return }
    const session = data.session
    const meta = (session.user.app_metadata ?? {}) as Record<string, unknown>
    setUserId(session.user.id)
    login(session.access_token, { sub: session.user.id, role: (meta['role'] as string) ?? 'PATIENT', facilityId: meta['facilityId'] as string | undefined })
    setStep('name')
  }

  async function handleFinish() {
    setLoading(true); setError(null)
    try {
      let photo_url: string | undefined
      if (photoUri) photo_url = await uploadProfilePhoto(photoUri, userId)
      const { error: err } = await supabase.auth.updateUser({
        data: { given_name: given, family_name: family, address: { province, district, village }, photo_url },
      })
      if (err) throw err
      router.replace('/(tabs)' as never)
    } catch {
      setError(t('signup.saveError'))
      void hapticNotification(NotificationFeedbackType.Error)
    } finally {
      setLoading(false)
    }
  }

  function goBack() {
    if (stepIndex > 0) setStep(ORDER[stepIndex - 1] as Step)
    else router.back()
  }

  const titles: Record<Step, { title: string; subtitle?: string }> = {
    phone: { title: t('signup.phoneTitle'), subtitle: t('signup.phoneSubtitle') },
    otp: { title: t('signup.codeTitle'), subtitle: t('signup.enterCodeFallback', { phone }) },
    name: { title: t('signup.nameTitle') },
    photo: { title: t('signup.photoTitle'), subtitle: t('signup.photoSubtitle') },
    address: { title: t('signup.addressTitle') },
  }

  return (
    <AuthShell title={titles[step].title} subtitle={titles[step].subtitle} onBack={goBack}>
      <WizardProgress step={stepIndex + 1} total={ORDER.length} />
      {error ? (
        <View style={[styles.banner, { backgroundColor: colors.dangerLight, borderColor: colors.danger }]}>
          <Text style={[styles.bannerText, { color: colors.dangerDark }]}>{error}</Text>
        </View>
      ) : null}

      {step === 'phone' && (
        <>
          <TextInput testID="phone-input" style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceSubtle }]} placeholder={t('register.phone')} placeholderTextColor={colors.textMuted} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Button testID="wizard-continue" label={t('signup.continue')} variant="primary" loading={loading} onPress={handleSendOtp} />
        </>
      )}

      {step === 'otp' && (
        <>
          <TextInput testID="otp-input" style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceSubtle }]} placeholder={t('register.sixDigitCode')} placeholderTextColor={colors.textMuted} value={otp} onChangeText={(x) => setOtp(x.replace(/[^0-9]/g, ''))} keyboardType="number-pad" maxLength={6} />
          <Button testID="wizard-continue" label={t('signup.continue')} variant="primary" loading={loading} onPress={handleVerifyOtp} />
        </>
      )}

      {step === 'name' && (
        <>
          <View style={styles.field}><Text style={[styles.label, { color: colors.textSecondary }]}>{t('signup.givenName')}</Text>
            <TextInput testID="given-name-input" style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceSubtle }]} value={given} onChangeText={setGiven} /></View>
          <View style={styles.field}><Text style={[styles.label, { color: colors.textSecondary }]}>{t('signup.familyName')}</Text>
            <TextInput testID="family-name-input" style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceSubtle }]} value={family} onChangeText={setFamily} /></View>
          <Button testID="wizard-continue" label={t('signup.continue')} variant="primary" disabled={!given.trim() || !family.trim()} onPress={() => setStep('photo')} />
        </>
      )}

      {step === 'photo' && (
        <>
          <PhotoPicker value={photoUri} onChange={setPhotoUri} />
          <Button testID="wizard-continue" label={t('signup.continue')} variant="primary" onPress={() => setStep('address')} />
          <Pressable testID="wizard-skip" onPress={() => setStep('address')} accessibilityRole="button" style={styles.skip}>
            <Text style={[styles.skipText, { color: colors.textMuted }]}>{t('signup.skip')}</Text>
          </Pressable>
        </>
      )}

      {step === 'address' && (
        <>
          <ProvincePicker value={province} onChange={(p) => { setProvince(p); setDistrict('') }} />
          <DistrictPicker province={province} value={district} onChange={setDistrict} />
          <View style={styles.field}><Text style={[styles.label, { color: colors.textSecondary }]}>{t('signup.village')}</Text>
            <TextInput testID="village-input" style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceSubtle }]} value={village} onChangeText={setVillage} /></View>
          <Button testID="wizard-finish" label={t('signup.finish')} variant="primary" loading={loading} disabled={!province || !district} onPress={handleFinish} />
        </>
      )}
    </AuthShell>
  )
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  bannerText: { fontFamily: FontFamily.sansMedium, fontSize: FontSize.sm },
  field: { gap: Spacing[1] },
  label: { fontFamily: FontFamily.sansMedium, fontSize: FontSize.sm },
  input: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing[3], fontSize: FontSize.base, fontFamily: FontFamily.sans },
  skip: { alignSelf: 'center', paddingVertical: Spacing[2] },
  skipText: { fontFamily: FontFamily.sansMedium, fontSize: FontSize.sm },
})
```
NOTE: the `otp` subtitle uses `t('signup.enterCodeFallback', { phone })`. Add `enterCodeFallback: 'Enter the code sent to {{phone}}'` (+ translations) to the `signup` block in all four locales (Task 2 block) — or reuse the existing `register.enterCode` key by calling `t('register.enterCode', { phone })` instead. Pick one and keep it consistent; the simplest is to call `t('register.enterCode', { phone })` (that key already exists in all locales) and delete the `enterCodeFallback` reference. Use `register.enterCode`.

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/signup-wizard.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**
```bash
git add apps/pharmopedia/src/components/signup/WizardProgress.tsx "apps/pharmopedia/app/(auth)/register.tsx" apps/pharmopedia/src/__tests__/signup-wizard.test.tsx
git commit -m "feat(pharmopedia): public signup wizard (phone→otp→name→photo→address)"
```

---

## Task 7: Finalize — full suite + typechecks

**Files:** none (verification only)

- [ ] **Step 1: Full Pharmopedia suite**

Run: `pnpm --filter @ultranos/pharmopedia test 2>&1 | grep -E "Test Files|Tests |FAIL " | sort | uniq`
Expected: new signup tests pass; the previously-passing `register-screen.test.tsx` (old interim register) may now fail because `register.tsx` changed — if so, update or retire it (the wizard test supersedes it; the old register screen no longer exists). Only remaining failures should be the pre-existing `clinical-tab-extended` ×4 (E5). Confirm no other new failures.

- [ ] **Step 2: Handle `register-screen.test.tsx`**

If `register-screen.test.tsx` fails (it tested the old two-field interim register), retire it: the signup-wizard test now covers the phone/OTP path. Delete `register-screen.test.tsx` OR rewrite its assertions for the wizard's phone step (`getByTestId('phone-input')` + `wizard-continue` → `signInWithOtp`). Prefer rewriting the phone-step assertion to keep coverage; mirror the signup-wizard mocks. Re-run.

- [ ] **Step 3: ui-native + typechecks**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native 2>&1 | grep -E "Test Files|Tests "` (expect 12 files / 41 pass)
Run: `pnpm --filter @ultranos/ui-kit typecheck >/dev/null 2>&1 && echo UIKIT_PASS; pnpm --filter @ultranos/pharmopedia typecheck 2>&1 | grep -c "native/"` (expect `UIKIT_PASS` + `0`)

- [ ] **Step 4: Commit (if verification-driven fixes were needed)**
```bash
git add -A
git commit -m "chore(pharmopedia): O2 signup wizard complete"
```

---

## Self-Review

**Spec coverage (O2 spec §3):**
- §3.1 wizard steps (phone/otp/name/photo/address/finish) → Task 6 (`register.tsx`). ✓
- §3.2 components (PickerField/Province/District, PhotoPicker, WizardProgress, profile-photo lib) → Tasks 3,4,5,6. ✓
- §3.3 Storage bucket + RLS → Task 1 Step 1. ✓
- §3.4 expo-image-picker dep + app.config + mock → Task 1. ✓
- §3.5 i18n signup namespace (4 locales) → Task 2. ✓
- §4 testing (nav/validation, OTP, pickers, photo skip, finish→updateUser, upload lib) → Tasks 3–6; finalize Task 7. ✓
- §6 success criteria → Task 7. ✓

**Placeholder scan:** every step has complete code/commands. Two reconciliation notes are explicit, not placeholders: (a) Task 6 Step 4 — use the existing `register.enterCode` for the OTP subtitle (drop `enterCodeFallback`); (b) Task 7 Step 2 — retire/rewrite the old `register-screen.test.tsx`. Both give the exact resolution.

**Type consistency:** `PickerField` props (label/placeholder/value/options/onSelect/disabled/testID) consistent across Province/District wrappers and tests; `PhotoPicker({value,onChange})` consistent (Task 4 + wizard); `uploadProfilePhoto(uri, userId)` consistent (Task 5 + wizard); `WizardProgress({step,total})` consistent; `AFGHAN_PROVINCES`/`getDistrictsByProvince` are the real shared-types exports; `Button` from `@ultranos/ui-kit/native` uses `label/variant/loading/disabled/onPress/testID` (E1 API); icons `Camera`/`ImagePlus`/`ChevronDown` added to the lucide mock in Task 4 before wizard use.

**Carried caveats:** real device photo capture + the premium feel/polish validated in an Expo run; the Storage bucket is created once via Supabase MCP (controller-run). O2 lands as several commits.
```
