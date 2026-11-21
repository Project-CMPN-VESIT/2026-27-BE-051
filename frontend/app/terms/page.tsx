import { LegalPage, type LegalSection } from "@/components/marketing/legal-page";

export const metadata = { title: "Terms of Service" };

const SECTIONS: LegalSection[] = [
  {
    heading: "Acceptance",
    body: "By creating an account or using CodeBazaar (\u201cthe platform\u201d), you agree to these terms. If you do not agree, do not use the platform.",
  },
  {
    heading: "Eligibility & accounts",
    body: "You must provide accurate information and keep your credentials secure. You are responsible for all activity under your account. You may not impersonate others or misrepresent your projects, contributions, or affiliations.",
  },
  {
    heading: "Projects & content",
    body: "You retain ownership of the code and content you submit. You represent that you have the right to list any repository you import, and that verification signals (commits, contributors, hackathon claims) you provide are genuine. Misrepresentation may result in removal and account suspension.",
  },
  {
    heading: "Trust scores & verification",
    body: "Verified Build Score, reputation, delivery, and authenticity signals are automated estimates provided \u201cas is\u201d to aid decisions. They are not guarantees. You should conduct your own due diligence before hiring, buying, or investing.",
  },
  {
    heading: "Payments & marketplace fees",
    body: "Paid features (AI reports, pitch decks, featured listings, memberships) are processed by our payment partner. Fees are shown before purchase. Project sales are subject to a platform commission, disclosed at listing. Except where required by law, payments for delivered digital services are non-refundable.",
  },
  {
    heading: "Payouts & settlement",
    body: "Seller earnings are settled to the payout details you provide, after platform fees. CodeBazaar does not hold customer funds as a deposit-taking service; settlements are processed out-of-band and recorded on your earnings page. You are responsible for the accuracy of your payout and tax details.",
  },
  {
    heading: "Offers & agreements between users",
    body: "Build requests, incubation, mentorship, funding, or acquisition offers, and any agreement reached through the platform, are between the users involved. CodeBazaar is not a party to those agreements and is not responsible for their performance.",
  },
  {
    heading: "Project adoption & ownership transfer",
    body: "If you open a project for adoption and approve a request, ownership of the listing transfers permanently to the new owner. Verification status resets until the new owner re-verifies ownership. The original author is retained as a credited contributor.",
  },
  {
    heading: "Acceptable use",
    body: "No fraud, plagiarism, spam, scraping, reverse engineering, or attempts to disrupt or gain unauthorized access to the platform. We may suspend accounts that violate these terms, and may remove content following a moderation review.",
  },
  {
    heading: "Disclaimers & liability",
    body: "The platform is provided \u201cas is\u201d without warranties. To the extent permitted by law, CodeBazaar is not liable for indirect or consequential damages arising from use of the platform.",
  },
  {
    heading: "Changes",
    body: "We may update these terms; continued use after changes constitutes acceptance. Material changes will be communicated in-app.",
  },
  {
    heading: "Contact",
    body: "Questions about these terms? Reach us at support@codebazaar.dev.",
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated={String(new Date().getFullYear())}
      intro="These terms govern your use of CodeBazaar — the marketplace, trust scoring, and payments that sit on top of it."
      disclaimer="This is a template for review by legal counsel before public launch. It is not legal advice."
      sections={SECTIONS}
      siblingLabel="Privacy Policy"
      siblingHref="/privacy"
    />
  );
}
