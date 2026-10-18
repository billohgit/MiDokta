import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";

export const metadata: Metadata = {
  title: "Terms and Conditions | Mi Dokta",
  description: "MiDokta Terms and Conditions of Use",
};

const SUPPORT_EMAIL = "techhealthafrica@gmail.com";
const Email = () => <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;

/** Public page: linked from sign-up, where accepting these terms is required. */
export default function TermsPage() {
  return (
    <main className="terms-page">
      <article className="card terms-card">
        <div className="login-brand">
          <Link href="/login" aria-label="Mi Dokta sign in">
            <Logo stacked tagline />
          </Link>
        </div>

        <h1>MiDokta Terms and Conditions of Use</h1>
        <dl className="terms-meta">
          <dt>Effective Date</dt>
          <dd>17th October 2026</dd>
          <dt>Last Updated</dt>
          <dd>17th October 2026</dd>
          <dt>Platform</dt>
          <dd>MiDokta Telemedicine Platform</dd>
          <dt>Operator</dt>
          <dd>TechHealth Africa</dd>
          <dt>Registered Address</dt>
          <dd>Sierra Leone</dd>
          <dt>Contact Email</dt>
          <dd>
            <Email />
          </dd>
          <dt>Website</dt>
          <dd>
            <a href="https://www.techhealthafrica.org" target="_blank" rel="noreferrer">
              https://www.techhealthafrica.org
            </a>
          </dd>
        </dl>

        <h2>1. Introduction and Acceptance</h2>
        <p>
          Welcome to MiDokta, a digital health and telemedicine platform operated by TechHealth Africa (“TechHealth
          Africa”, “we”, “us” or “our”).
        </p>
        <p>
          These Terms and Conditions (“Terms”) govern your access to and use of the MiDokta mobile application, website,
          telemedicine services, communication tools, appointment-management features, medication reminders, payment
          facilities and any artificial intelligence-enabled features made available through the platform.
        </p>
        <p>
          By creating an account, accessing or using MiDokta, you acknowledge that you have read and understood these
          Terms and agree to be bound by them. If you do not agree, you must not use the platform.
        </p>
        <p>
          These Terms should be read together with our Privacy Policy, applicable consent forms, payment and cancellation
          policy, and any additional terms presented for specific services.
        </p>
        <p>
          Your use of MiDokta does not remove any rights or protections available to you under applicable law. Where a
          provision of these Terms conflicts with mandatory legal requirements, the applicable law will prevail.
        </p>

        <h2>2. Definitions</h2>
        <p>For the purposes of these Terms:</p>
        <ul>
          <li>
            <strong>“MiDokta”</strong> means the digital health platform and associated services operated by TechHealth
            Africa.
          </li>
          <li>
            <strong>“User”</strong> means any person accessing or using MiDokta, including patients, healthcare
            professionals and authorised representatives.
          </li>
          <li>
            <strong>“Patient”</strong> means a person seeking healthcare information, an appointment, a consultation or
            other health-related services through MiDokta.
          </li>
          <li>
            <strong>“Healthcare Professional”</strong> means a doctor or other appropriately qualified and authorised
            healthcare practitioner providing services through the platform.
          </li>
          <li>
            <strong>“Platform Services”</strong> means the digital functions provided by MiDokta, including
            consultations, messaging, appointment management and related tools.
          </li>
          <li>
            <strong>“Health Data”</strong> means information relating to a person&apos;s physical or mental health,
            medical history, symptoms, diagnosis, treatment, prescriptions or healthcare interactions.
          </li>
          <li>
            <strong>“AI Features”</strong> means artificial intelligence-enabled functions, including the Omega assistant
            where available.
          </li>
          <li>
            <strong>“Third-Party Services”</strong> means services supplied by external providers, including cloud
            hosting, telecommunications, payment processing and messaging services.
          </li>
        </ul>

        <h2>3. Eligibility and Account Registration</h2>
        <p>
          3.1. You must provide accurate, complete and current information when registering for an account and using the
          platform.
        </p>
        <p>
          3.2. You must be legally capable of entering into an agreement under the laws applicable to you. Where a
          minimum age applies, you must meet that requirement.
        </p>
        <p>
          3.3. A parent, legal guardian or other person legally authorised to act on behalf of a child or an adult
          lacking decision-making capacity may use MiDokta on that person&apos;s behalf, subject to applicable law,
          appropriate consent requirements and platform procedures.
        </p>
        <p>
          3.4. You must not impersonate another person, create an account using false information or misrepresent your
          qualifications or professional registration.
        </p>
        <p>
          3.5. We may request reasonable information to verify identity, professional credentials, eligibility or
          authority to act on another person&apos;s behalf.
        </p>
        <p>
          3.6. We may refuse, restrict or suspend account access where reasonably necessary to prevent fraud, protect
          patient safety, comply with law or enforce these Terms.
        </p>

        <h2>4. Description of Services</h2>
        <p>Depending on availability, location, user eligibility and applicable law, MiDokta may provide:</p>
        <ol type="a">
          <li>Online appointment booking and management;</li>
          <li>Video, audio or text-based consultations;</li>
          <li>Secure messaging between patients and authorised healthcare professionals;</li>
          <li>Access to health information and educational resources;</li>
          <li>Medication and appointment reminders;</li>
          <li>Electronic storage or exchange of health-related information;</li>
          <li>Payment processing for eligible services;</li>
          <li>AI-assisted health information and clinical workflow support through Omega; and</li>
          <li>Other digital health services introduced by TechHealth Africa.</li>
        </ol>
        <p>
          The availability of any feature may vary by country, healthcare provider, device, network connectivity and
          regulatory requirements.
        </p>
        <p>
          We may introduce, update, suspend or discontinue features where reasonably necessary for operational,
          technical, clinical safety, security or legal reasons. Where a change materially affects a paid service or a
          user&apos;s rights, we will provide notice where reasonably practicable and as required by law.
        </p>

        <h2>5. Important Medical Disclaimer</h2>
        <p>
          <strong>
            MiDokta is a digital platform that facilitates access to healthcare services. It is not, by itself, a
            hospital, emergency service or substitute for all forms of in-person medical care.
          </strong>
        </p>
        <p>
          Unless expressly stated otherwise and legally authorised, TechHealth Africa provides the technology
          infrastructure and does not itself diagnose, prescribe treatment or deliver clinical care merely by operating
          MiDokta.
        </p>
        <p>
          Information provided through the platform, including general health articles, automated messages, reminders and
          AI-generated outputs, is not a substitute for an individual assessment by a qualified healthcare professional.
        </p>
        <p>
          You should not delay seeking medical attention because of information displayed in MiDokta, a failed
          connection, an unavailable appointment or an AI-generated response.
        </p>
        <h3>Medical emergencies</h3>
        <p>
          MiDokta is not an emergency response service and does not guarantee immediate monitoring or intervention.
        </p>
        <p>
          If you experience a potentially life-threatening emergency, including severe difficulty breathing, suspected
          stroke, severe bleeding, loss of consciousness or another urgent medical condition, contact your local
          emergency services or attend the nearest appropriate emergency facility immediately. Do not rely on a MiDokta
          message or online appointment to obtain emergency assistance.
        </p>
        <h3>No guarantee of clinical outcome</h3>
        <p>
          Healthcare outcomes depend on many factors, including the patient&apos;s condition, the information available,
          the timeliness of care and the professional judgement of the treating clinician. We do not guarantee a
          diagnosis, cure, treatment outcome or particular clinical result.
        </p>

        <h2>6. Telemedicine and Clinical Responsibility</h2>
        <p>
          6.1. Telemedicine may be unsuitable for certain symptoms or conditions. A healthcare professional may recommend
          an in-person examination, laboratory investigation, imaging, referral or emergency assessment.
        </p>
        <p>
          6.2. Patients must provide information that is truthful and reasonably complete, including relevant symptoms,
          allergies, medication use, medical history and other details requested for safe care.
        </p>
        <p>
          6.3. Healthcare professionals are responsible for determining whether a remote consultation is clinically
          appropriate, obtaining any required informed consent, conducting their professional assessment, maintaining
          appropriate records and making clinical decisions within their scope of practice.
        </p>
        <p>
          6.4. Healthcare professionals must maintain the licences, registrations, qualifications, insurance and other
          authorisations required by the jurisdictions in which they practise and provide services.
        </p>
        <p>
          6.5. Patients are responsible for following agreed clinical instructions and seeking further care when symptoms
          persist, worsen or require urgent attention. This does not remove a healthcare professional&apos;s legal or
          professional duties.
        </p>
        <p>
          6.6. The platform may facilitate communication and access to services but cannot guarantee that a particular
          professional will be available, that a consultation will occur without interruption or that every condition can
          be assessed remotely.
        </p>
        <p>
          6.7. Healthcare professionals must not use MiDokta to provide services outside their competence or legal
          authority.
        </p>
        <p>
          6.8. Where a consultation cannot be completed safely because of poor connectivity, inadequate information,
          technical failure or another limitation, the patient and clinician should use an appropriate alternative route
          to care.
        </p>

        <h2>7. Informed Consent and Communications</h2>
        <p>
          7.1. You agree to use the communication tools only for their intended purposes and to communicate respectfully
          and lawfully.
        </p>
        <p>
          7.2. Before receiving a telemedicine consultation, you may be required to acknowledge the nature, benefits and
          limitations of remote healthcare, including risks associated with technology failure and the need for
          in-person care in some circumstances.
        </p>
        <p>
          7.3. Recording, transcribing or otherwise capturing a consultation requires appropriate notice and consent,
          together with compliance with applicable law and professional obligations. A consultation must not be recorded
          secretly through MiDokta.
        </p>
        <p>
          7.4. You should use a private environment and take reasonable steps to prevent unauthorised persons from
          hearing or viewing confidential consultation information.
        </p>
        <p>
          7.5. Electronic communications may not always be delivered instantly or successfully. Unless expressly agreed
          and legally supported, messages and notifications must not be treated as continuously monitored clinical
          channels.
        </p>

        <h2>8. Omega and Artificial Intelligence Features</h2>
        <p>
          8.1. Where enabled, Omega is an AI-assisted feature designed to support selected digital health and clinical
          workflows. Depending on the functionality released, this may include consultation transcription, drafting
          clinical documentation, suggesting possible prescription content or suggesting investigations for a healthcare
          professional to consider.
        </p>
        <p>
          8.2. AI outputs may be incomplete, inaccurate, outdated, biased or inappropriate for an individual patient. They
          must not be assumed to be correct solely because they are generated by an AI system.
        </p>
        <p>
          8.3. AI-generated suggestions do not constitute a final diagnosis, prescription, treatment decision or
          substitute for qualified professional judgement.
        </p>
        <p>
          8.4. A qualified and appropriately authorised healthcare professional must independently review, verify and
          approve any AI-assisted clinical documentation, prescription or investigation recommendation before it is
          adopted for patient care, where such features are legally permitted.
        </p>
        <p>
          8.5. Patients must not rely solely on Omega or another automated feature to diagnose a condition, change
          medication, determine a dosage or decide whether emergency care is necessary.
        </p>
        <p>
          8.6. AI features may be unavailable, limited, changed or withdrawn while being tested, validated or improved. No
          feature will be represented as clinically validated, certified or approved unless the relevant status has been
          established and may lawfully be claimed.
        </p>
        <p>
          8.7. Where health information is processed by an external AI or technology provider, that processing must be
          governed by the applicable Privacy Policy, appropriate contractual safeguards and applicable law. Health data
          must not be used to train external AI models or for unrelated purposes without an appropriate lawful basis and
          any consent required by law.
        </p>
        <p>
          8.8. We aim to develop and operate AI features in accordance with principles of human oversight, transparency,
          safety, fairness, accountability and privacy.
        </p>

        <h2>9. Privacy and Protection of Health Information</h2>
        <p>
          9.1. TechHealth Africa recognises that health information is sensitive and requires appropriate protection.
        </p>
        <p>
          9.2. Our collection, use, storage, disclosure, transfer and retention of personal information are described in
          the MiDokta Privacy Policy, which must be made available to users separately from these Terms.
        </p>
        <p>
          9.3. Depending on the service used, information may include identity and contact details, account credentials,
          appointment records, consultation communications, medical history, prescriptions, payment status, technical
          logs and information required to maintain platform security.
        </p>
        <p>
          9.4. We will process personal information only on an appropriate lawful basis and for specified, legitimate
          purposes, in accordance with applicable data protection requirements.
        </p>
        <p>
          9.5. We will implement reasonable technical and organisational safeguards designed to protect information
          against unauthorised access, loss, alteration, disclosure and destruction. No online service can guarantee
          absolute security.
        </p>
        <p>
          9.6. Access to identifiable health information should be restricted to authorised persons who need it for
          legitimate care, support, security, administration or other legally permitted purposes.
        </p>
        <p>
          9.7. We may engage carefully selected service providers to support hosting, communications, payment processing,
          security, analytics or other essential functions, subject to appropriate contractual and data-protection
          safeguards.
        </p>
        <p>
          9.8. Where information is transferred internationally, we will implement the safeguards and legal mechanisms
          required by applicable law.
        </p>
        <p>
          9.9. We will retain information only for as long as reasonably necessary for its stated purpose, subject to
          clinical-record obligations, legal retention requirements, dispute resolution and other lawful grounds.
        </p>
        <p>
          9.10. Subject to applicable law, users may have rights to access, correct, obtain a copy of, restrict or request
          deletion of their personal information, object to certain processing or withdraw consent where consent is the
          relevant legal basis.
        </p>
        <p>
          9.11. Requests concerning personal information may be sent to <Email />. We may need to verify your identity
          before responding.
        </p>
        <p>
          9.12. If a personal data incident occurs, we will assess and respond to it in accordance with applicable law,
          including any relevant notification requirements.
        </p>

        <h2>10. Account Security and Acceptable Use</h2>
        <p>You agree to:</p>
        <ol type="a">
          <li>Keep your password, authentication codes and account credentials confidential;</li>
          <li>Use reasonable security measures on your device;</li>
          <li>Notify us promptly if you suspect unauthorised access;</li>
          <li>Provide truthful information and avoid misleading other users;</li>
          <li>Respect the confidentiality, dignity and rights of patients and healthcare professionals;</li>
          <li>Use the platform only for lawful purposes; and</li>
          <li>Comply with applicable laws and these Terms.</li>
        </ol>
        <p>You must not:</p>
        <ol type="a">
          <li>Access another person&apos;s account or health information without proper authority;</li>
          <li>Upload malicious software or attempt to compromise platform security;</li>
          <li>Harass, threaten, defraud or exploit other users;</li>
          <li>Submit false prescriptions, fabricated medical information or fraudulent payment details;</li>
          <li>Use the platform to distribute unlawful, abusive or harmful material;</li>
          <li>
            Scrape, copy, reverse engineer or interfere with the platform except where permitted by law or expressly
            authorised;
          </li>
          <li>Use MiDokta to provide unauthorised medical services; or</li>
          <li>Attempt to bypass security controls or gain access to restricted systems or records.</li>
        </ol>
        <p>
          We may investigate suspected misuse and take proportionate action, including restricting access, preserving
          relevant records where lawful and reporting suspected unlawful conduct to appropriate authorities when legally
          required or justified.
        </p>

        <h2>11. Appointments, Cancellations and Refunds</h2>
        <p>
          11.1. Appointment availability, fees, duration, cancellation deadlines and refund eligibility will be displayed
          or communicated before a booking is confirmed, where applicable.
        </p>
        <p>11.2. A booking is confirmed only when the platform or relevant provider communicates confirmation.</p>
        <p>
          11.3. Patients should attend appointments at the scheduled time and provide reasonable notice if they need to
          cancel or reschedule.
        </p>
        <p>
          11.4. Cancellation, missed-appointment and refund rules must be explained in a separate, accessible policy. Any
          applicable refund will be processed according to that policy and mandatory consumer-protection law.
        </p>
        <p>
          11.5. If a consultation is cancelled by the provider or cannot be delivered because of a material platform
          failure, we will communicate the available options, which may include rescheduling or a refund where
          appropriate and legally required.
        </p>
        <p>
          11.6. Refunds may be subject to payment-provider processing times. We will not exclude any refund right that
          cannot lawfully be excluded.
        </p>
        <p>
          11.7. Any subscription, recurring payment or automatic renewal must be clearly disclosed before purchase, with a
          reasonable method for cancellation.
        </p>

        <h2>12. Payments and Third-Party Payment Providers</h2>
        <p>
          12.1. Where payments are enabled, fees and applicable charges will be presented before the user completes the
          transaction.
        </p>
        <p>
          12.2. Payments may be processed by authorised third-party payment providers. Online payments on MiDokta,
          including mobile money (such as Orange Money and Afrimoney) and card payments, are currently processed by{" "}
          <a href="https://monime.io" target="_blank" rel="noreferrer">
            Monime
          </a>
          . Their processing of payment information may be subject to their own terms and privacy notices.
        </p>
        <p>
          12.3. Users must provide accurate payment information and must not use payment methods without proper
          authority.
        </p>
        <p>
          12.4. TechHealth Africa will not knowingly request that users disclose payment PINs, one-time passwords or
          confidential banking credentials through an ordinary chat or consultation.
        </p>
        <p>
          12.5. Any applicable taxes, transaction fees or additional charges will be disclosed as required by law.
        </p>
        <p>
          12.6. Disputed charges should be reported to <a href="tel:+23277530708">+232 77 530708</a>. Nothing in these
          Terms limits statutory rights relating to unauthorised transactions, defective services or consumer complaints.
        </p>

        <h2>13. Healthcare Professionals and Provider Verification</h2>
        <p>
          13.1. Healthcare professionals using MiDokta must provide accurate professional information and evidence of
          qualifications or registration when requested.
        </p>
        <p>
          13.2. Healthcare professionals are responsible for maintaining valid professional authorisation, following
          applicable clinical standards and complying with confidentiality, informed-consent, record-keeping and
          prescribing requirements.
        </p>
        <p>
          13.3. Verification by MiDokta, where conducted, does not guarantee a professional&apos;s future conduct,
          competence or clinical outcome.
        </p>
        <p>
          13.4. Healthcare professionals must not share accounts, delegate access to patient records without authority or
          use patient information for unrelated personal or commercial purposes.
        </p>
        <p>
          13.5. Any professional fees, service agreements, revenue-sharing arrangements or independent provider terms must
          be documented separately where necessary.
        </p>
        <p>
          13.6. Where a healthcare professional is engaged directly by TechHealth Africa rather than independently, the
          relevant contractual relationship and responsibilities must be stated in the applicable agreement.
        </p>

        <h2>14. Children and Vulnerable Users</h2>
        <p>
          14.1. MiDokta must be used in accordance with applicable age restrictions, child-protection requirements and
          laws governing consent to healthcare.
        </p>
        <p>
          14.2. A parent, guardian or legally authorised representative may be required to provide consent or assist with
          an account for a child, subject to the child&apos;s legal rights and applicable rules on confidential
          healthcare.
        </p>
        <p>
          14.3. Information relating to children or persons who may be vulnerable must receive appropriate safeguards.
        </p>
        <p>
          14.4. Users must not exploit the platform to contact, groom, abuse or otherwise harm a child or vulnerable
          person.
        </p>
        <p>
          14.5. Where safeguarding concerns arise, TechHealth Africa may take reasonable steps consistent with applicable
          law and patient safety, including restricting access or referring concerns to an appropriate authority where
          required.
        </p>

        <h2>15. Availability, Technical Limitations and Accessibility</h2>
        <p>15.1. We aim to maintain a reliable platform but do not guarantee uninterrupted or error-free access.</p>
        <p>
          15.2. Services may be affected by internet availability, power interruptions, device compatibility,
          maintenance, third-party outages, cyber incidents or circumstances beyond our reasonable control.
        </p>
        <p>
          15.3. Video and audio consultations require compatible devices and adequate connectivity. Users should follow
          any instructions for switching to an available alternative communication method.
        </p>
        <p>
          15.4. We aim to make MiDokta accessible to users with different abilities, levels of digital literacy, devices
          and connectivity conditions. However, we cannot guarantee compatibility with every device, assistive technology
          or network.
        </p>
        <p>
          15.5. Where a technical problem creates a risk to patient safety, users should seek an appropriate alternative
          route to care rather than wait for the platform to recover.
        </p>

        <h2>16. Intellectual Property</h2>
        <p>
          16.1. Unless otherwise stated, the MiDokta name, branding, software, interface, designs, documentation and
          platform materials are owned by or licensed to TechHealth Africa and are protected by applicable intellectual
          property laws.
        </p>
        <p>
          16.2. Subject to these Terms, we grant you a limited, personal, non-exclusive, non-transferable and revocable
          right to use MiDokta for its intended lawful purpose.
        </p>
        <p>
          16.3. You must not reproduce, distribute, sell, modify or commercially exploit our intellectual property without
          prior written permission, except to the extent permitted by law.
        </p>
        <p>
          16.4. Users retain rights they hold in information and materials they lawfully provide. By submitting
          information necessary to operate the service, you authorise its use for the relevant service purposes and as
          otherwise explained in the Privacy Policy.
        </p>
        <p>
          16.5. Nothing in these Terms transfers ownership of a patient&apos;s medical information to TechHealth Africa
          merely because it is stored or transmitted through MiDokta.
        </p>
        <p>
          16.6. Use of third-party software, trademarks, APIs or content may be subject to separate licences and terms.
        </p>

        <h2>17. Third-Party Services and External Links</h2>
        <p>
          MiDokta may integrate with or link to third-party services, including cloud hosting, telecommunications,
          messaging, payment services and external healthcare resources.
        </p>
        <p>
          Those services may be governed by separate terms and privacy notices. TechHealth Africa does not control every
          aspect of a third-party service and is not responsible for its independent actions except to the extent
          liability cannot lawfully be excluded or arises from our own duties.
        </p>
        <p>
          We will take reasonable steps to select and manage service providers in accordance with applicable legal,
          privacy and security requirements.
        </p>

        <h2>18. Disclaimers and Limitation of Liability</h2>
        <p>
          18.1. MiDokta is provided subject to the warranties and protections required by applicable law. To the extent
          legally permitted, we do not warrant that every feature will always be available, uninterrupted, error-free or
          suitable for every user&apos;s particular circumstances.
        </p>
        <p>
          18.2. We are not responsible for clinical decisions made independently by healthcare professionals solely
          because those professionals use MiDokta. This provision does not exclude any responsibility that TechHealth
          Africa may have under applicable law for its own acts, omissions, contractual duties, platform operations or
          representations.
        </p>
        <p>
          18.3. Nothing in these Terms excludes or limits liability for fraud, fraudulent misrepresentation, wilful
          misconduct, death or personal injury where exclusion is prohibited by law, or any other liability that cannot
          legally be excluded or limited.
        </p>
        <p>
          18.4. Subject to the preceding provisions and applicable law, TechHealth Africa will not be liable for indirect
          or consequential losses that could not reasonably have been foreseen, where such exclusion is lawful.
        </p>
        <p>
          18.5. Nothing in this section removes a healthcare professional&apos;s independent legal or professional
          obligations or limits a patient&apos;s mandatory statutory rights.
        </p>

        <h2>19. Indemnity</h2>
        <p>
          To the extent permitted by applicable law, a user may be responsible for direct losses, claims or reasonable
          costs arising from that user&apos;s unlawful conduct, fraud, deliberate misuse of MiDokta or material breach of
          these Terms.
        </p>
        <p>
          This provision does not require a consumer to indemnify TechHealth Africa for losses caused by TechHealth
          Africa&apos;s own negligence, unlawful conduct or breach of a duty that cannot lawfully be transferred to the
          user.
        </p>

        <h2>20. Suspension and Termination</h2>
        <p>
          20.1. You may stop using MiDokta and request account closure through email or by voluntarily deleting your
          account at any given time if and only if you do not owe any deficit from your account.
        </p>
        <p>
          20.2. We may suspend or terminate access where reasonably necessary because of serious or repeated breaches of
          these Terms, suspected fraud, security threats, unlawful use, professional-registration concerns or legal
          requirements.
        </p>
        <p>
          20.3. Where appropriate and legally permissible, we will provide notice and an opportunity to address a breach
          before taking action. Immediate restrictions may be necessary to protect patients, personal information or
          platform security.
        </p>
        <p>
          20.4. Account closure does not automatically erase medical records that must be retained under applicable law
          or professional obligations.
        </p>
        <p>
          20.5. We will explain any relevant data-retention consequences through our Privacy Policy and applicable
          procedures.
        </p>
        <p>
          20.6. Provisions that by their nature should continue after termination, including those concerning
          intellectual property, lawful record retention, outstanding payments, liability and dispute resolution, will
          continue to apply to the extent legally permitted.
        </p>

        <h2>21. Complaints and Dispute Resolution</h2>
        <p>
          21.1. Users may submit complaints about platform access, billing, privacy, security, provider conduct or other
          MiDokta services by email to <Email />.
        </p>
        <p>
          21.2. Complaints concerning clinical care should be directed to the relevant healthcare professional or provider
          and, where appropriate, the competent professional or regulatory body.
        </p>
        <p>
          21.3. We will acknowledge and handle complaints within reasonable timeframes and in accordance with applicable
          legal obligations.
        </p>
        <p>
          21.4. Where a dispute cannot be resolved informally, the parties may pursue remedies available under applicable
          law, including referral to a competent court, regulator or other authorised dispute-resolution mechanism.
        </p>
        <p>
          21.5. Nothing in this section prevents a user from contacting a competent regulator, reporting a safety concern
          or exercising a statutory right.
        </p>

        <h2>22. Changes to These Terms</h2>
        <p>
          We may update these Terms to reflect changes in the platform, applicable law, security practices or services.
        </p>
        <p>
          The updated version will be published with a revised effective date. Where a change materially affects
          users&apos; rights or obligations, we will provide reasonable notice and obtain renewed acceptance where
          required by law.
        </p>
        <p>
          Your continued use of MiDokta after an update takes effect may constitute acceptance only to the extent
          permitted by applicable law. Where renewed consent is legally required, we will obtain it.
        </p>

        <h2>23. Governing Law and Jurisdiction</h2>
        <p>
          These Terms are intended to operate subject to the mandatory laws applicable to the user, the relevant
          healthcare service and the operation of MiDokta.
        </p>
        <p>
          For services operated from Sierra Leone, the parties intend that the laws of Sierra Leone will govern these
          Terms to the extent legally applicable, subject to mandatory consumer, healthcare, privacy and other protections
          that may apply in the user&apos;s jurisdiction.
        </p>
        <p>
          Any dispute will be brought before a court or other competent forum with lawful jurisdiction. Nothing in this
          section removes a consumer&apos;s right to bring a claim in a forum where applicable law grants that right.
        </p>

        <h2>24. General Provisions</h2>
        <p>
          24.1. <strong>Entire agreement:</strong> These Terms and the policies expressly incorporated into them form the
          agreement governing use of MiDokta, subject to any separate signed agreement and mandatory law.
        </p>
        <p>
          24.2. <strong>Severability:</strong> If any provision is held invalid or unenforceable, the remaining provisions
          will continue to apply to the extent legally permitted.
        </p>
        <p>
          24.3. <strong>No waiver:</strong> Failure to enforce a provision immediately does not necessarily waive the
          right to enforce it later.
        </p>
        <p>
          24.4. <strong>Assignment:</strong> Users may not transfer their rights or obligations under these Terms without
          our consent where consent is required. TechHealth Africa may transfer its rights or obligations only in
          accordance with applicable law and without removing users&apos; mandatory protections.
        </p>
        <p>
          24.5. <strong>Force majeure:</strong> We will not be responsible for a delay or failure caused by circumstances
          beyond our reasonable control to the extent recognised by applicable law. This does not remove non-excludable
          obligations, including applicable duties concerning patient safety and personal information.
        </p>
        <p>
          24.6. <strong>Language:</strong> The English version of these Terms is the authoritative version unless
          applicable law requires otherwise. Translations may be provided to improve accessibility.
        </p>

        <h2>25. Contact Information</h2>
        <p>For questions about these Terms, please contact:</p>
        <address>
          <strong>TechHealth Africa</strong>
          <br />
          Platform: MiDokta
          <br />
          Website:{" "}
          <a href="https://www.techhealthafrica.org" target="_blank" rel="noreferrer">
            https://www.techhealthafrica.org
          </a>
          <br />
          General Support: <Email />
          <br />
          Registered Address: Sierra Leone
          <br />
          Telephone: <a href="tel:+23276670574">+232 76 670574</a>
        </address>
        <p>
          By using MiDokta, you acknowledge that you have had an opportunity to read these Terms and access the related
          Privacy Policy and applicable service-specific notices.
        </p>

        <p className="login-alt">
          <Link href="/signup">Create an account</Link> · <Link href="/login">Sign in</Link>
        </p>
      </article>
    </main>
  );
}
