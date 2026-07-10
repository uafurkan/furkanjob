"use client";
import { useState } from "react";
import ProfileForm from "@/components/ProfileForm";
import LinkedInImport from "@/components/LinkedInImport";

type Initial = {
  fullName: string;
  contactEmail: string;
  languages: string[];
  targetRoles: string[];
  targetCountries: string[];
  needsVisaSponsorship: boolean;
  relocation: boolean;
  shortBio: string;
  currentCountry: string;
  includeSignature: boolean;
  digestOptOut: boolean;
  reminderOptOut: boolean;
  weeklyGoal: number;
  applicationLanguage: string;
  hasVisa: boolean;
  visaType: string;
  visaLabel: string;
  visaCountries: string[];
};

type CvItem = { id: string; filename: string; isDefault: boolean };

type Props = {
  initial: Initial;
  cvFilename: string | null;
  initialCvs: CvItem[];
  gmailConnected: boolean;
  googleEnabled: boolean;
};

export default function ProfilePageClient({ initial, cvFilename, initialCvs, gmailConnected, googleEnabled }: Props) {
  const [formKey, setFormKey] = useState(0);
  const [formInitial, setFormInitial] = useState<Initial>(initial);

  function handleLinkedInApply(parsed: {
    fullName: string | null;
    currentTitle: string | null;
    languages: string[];
    targetRoles: string[];
    shortBio: string | null;
  }) {
    setFormInitial((prev) => ({
      ...prev,
      fullName: parsed.fullName || prev.fullName,
      languages: parsed.languages.length > 0 ? parsed.languages : prev.languages,
      targetRoles: parsed.targetRoles.length > 0 ? parsed.targetRoles : prev.targetRoles,
      shortBio: parsed.shortBio || prev.shortBio,
    }));
    setFormKey((k) => k + 1);
  }

  return (
    <>
      <LinkedInImport onApply={handleLinkedInApply} />
      <ProfileForm
        key={formKey}
        mode="edit"
        initial={formInitial}
        cvFilename={cvFilename}
        initialCvs={initialCvs}
        gmailConnected={gmailConnected}
        googleEnabled={googleEnabled}
      />
    </>
  );
}
