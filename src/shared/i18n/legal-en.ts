/** RYT-115: the privacy policy and the terms of use. Every statement mirrors what the app does. */
export const legalEn = {
  'legal.back': 'Back',
  'legal.goToApp': 'Go to Rytta',
  'legal.otherLanguage': 'Leer en español',
  'legal.draft': 'Draft pending owner review',
  'legal.draftHelp': 'This text is a draft and has no legal effect until the owner approves it.',
  'legal.effective': 'In force since {{date}}',
  'legal.draftDate': 'Draft of {{date}}',
  'legal.contactPending': 'contact address pending, to be published before launch',
  'legal.other.privacy': 'Read the privacy policy',
  'legal.other.terms': 'Read the terms of use',
  'legal.privacy': 'Privacy policy',
  'legal.contact': 'Contact',
  'legal.terms': 'Terms of use',
  'legal.links': 'Privacy and terms',
  'legal.footer': 'Legal information and contact',
  'legal.linksHelp': 'What Rytta stores about you and the rules for using it.',

  'legal.privacy.intro':
    'Rytta is a companion app for in-person tabletop role-playing, run by its owner as a small independent project. This page says what the app stores about you, where, and what you can do about it.',

  'legal.privacy.who.title': 'Who runs the service',
  'legal.privacy.who.p1':
    '{{owner}}, a natural person, is responsible for the processing of Rytta data. Contact: {{contact}}.',
  'legal.privacy.who.pending':
    'The service is run by its owner, who decides why and how your data is used. The responsible person will be identified before launch. Contact: {{contact}}.',

  'legal.privacy.collect.title': 'What we collect',
  'legal.privacy.collect.p1': 'Only what the app needs to sign you in and run your games:',
  'legal.privacy.collect.l1':
    'Your email address and, if you sign in with Google, the name of your Google account, received through Supabase Auth. If you create the account with an email and a password, Supabase Auth stores the password only as an irreversible hash. Rytta never sees your passwords.',
  'legal.privacy.collect.l2':
    'Your username, which you choose and which the members of your campaigns see.',
  'legal.privacy.collect.l3':
    'What you create or is created for you: campaigns, memberships, invitations (the invited email address is kept until it is accepted or expires), characters, inventories, shops, combats, rolls you log in a campaign and tabletop scenes.',
  'legal.privacy.collect.l4':
    'The images and audio you upload for creatures, items, shops and tabletop scenes.',
  'legal.privacy.collect.p2':
    'This data is used only to sign you in, show your campaigns to the people you play with and keep your game. It is not sold and not used for advertising.',

  'legal.privacy.where.title': 'Where it is stored',
  'legal.privacy.where.p1':
    'Account and game data and uploaded files are stored in a Supabase project in the EU (region eu-west-1). Supabase Auth handles sign-in with Google or with an email and a password. Account confirmation and password reset emails are sent through Brevo, which receives your email address to deliver them. When you sign in or create the account with an email, Cloudflare Turnstile checks that you are not an automated program; to do so it sees technical data from your browser and your IP address.',
  'legal.privacy.where.p2':
    'Uploaded files sit in private storage and each campaign has a space quota for its images. When you replace an image, the previous file is deleted. The pages of the app are static files served from Cloudflare and, during the transition, also from GitHub Pages; like any web host, they see technical request data such as your IP address when your browser loads them. To offer you updates, the app also downloads a small version-number file from that same site; it sends none of your data.',

  'legal.privacy.visibility.title': 'Who can see what',
  'legal.privacy.visibility.l1':
    'The DM of a campaign sees the email address and username of each member of that campaign, and the invitations the DM sent.',
  'legal.privacy.visibility.l2':
    'Players see the party data their DM shares: characters, inventories and encounters of that campaign. DM-only material is hidden from them. Rolls logged in a campaign are shown with the visibility its DM sets.',
  'legal.privacy.visibility.l3':
    'People outside your campaigns cannot read your game data: the database enforces these access rules. The owner can technically reach the database in order to operate the service.',

  'legal.privacy.local.title': 'Browser storage and cookies',
  'legal.privacy.local.p1': 'Rytta saves a few small items in your browser:',
  'legal.privacy.local.l1': 'your sign-in session token, so you stay signed in;',
  'legal.privacy.local.l2': 'your language, theme and weight unit;',
  'legal.privacy.local.l3':
    'interface conveniences, such as list or grid views, recent glossary entries, favourite creatures and the last tabletop view.',
  'legal.privacy.local.p2':
    'Rytta has no analytics, advertising or tracking cookies or scripts. Clearing your browser data removes these items and signs you out.',

  'legal.privacy.retention.title': 'How long we keep it',
  'legal.privacy.retention.p1':
    'Your data is kept while your account exists, so your campaigns stay available. When you delete your account from Settings, your profile, your memberships and the campaigns where you are the only member are removed, with their images. In shared campaigns the history stays without your name and your characters return to the campaign pool. Database backups are deleted as they expire.',

  'legal.privacy.rights.title': 'Your rights',
  'legal.privacy.rights.p1':
    'You can see, correct, export and delete your data, and object to how it is used. From Settings you can change your username, export your data and delete your account. For anything else, write to the contact above. If you live in the EU you can also complain to your data protection authority.',

  'legal.privacy.age.title': 'Minimum age',
  'legal.privacy.age.p1':
    'Rytta is for people aged 14 or older, the age from which you can consent to the processing of your data in Spain. We do not knowingly keep accounts of users under 14. If you believe an account belongs to someone younger, write to the contact above: we will delete it together with its data.',

  'legal.privacy.third.title': 'Third parties',
  'legal.privacy.third.p1':
    'Google (sign-in with Google), Supabase (database, sign-in and file storage), Brevo (account emails), Cloudflare (page hosting and the Turnstile bot check) and GitHub (page hosting during the transition) process data as described above. The 3D dice, the illustrations and the rules text are part of the app and load from the same site; they send your data to no one.',

  'legal.privacy.changes.title': 'Changes to this policy',
  'legal.privacy.changes.p1':
    'When this policy changes, this page and its date change with it. Check it from time to time.',

  'legal.terms.intro':
    'These terms apply when you use Rytta, a companion app for in-person tabletop role-playing. By signing in you accept them.',

  'legal.terms.service.title': 'The service',
  'legal.terms.service.p1':
    'Rytta is provided as it is, without warranty. It can change, be interrupted or lose features. Keep your own notes of anything you cannot afford to lose.',

  'legal.terms.age.title': 'Minimum age',
  'legal.terms.age.p1':
    'To use a Rytta account you must be at least 14 years old. If you are younger, do not create an account.',

  'legal.terms.use.title': 'Acceptable use',
  'legal.terms.use.p1': 'When you use Rytta, you agree not to:',
  'legal.terms.use.l1': 'upload or share illegal content;',
  'legal.terms.use.l2':
    'upload material you have no right to use: respect the intellectual property of others;',
  'legal.terms.use.l3':
    'harass other members, or try to read data of campaigns you do not belong to;',
  'legal.terms.use.l4':
    'abuse the service or its quotas, or try to bypass its limits or access rules.',

  'legal.terms.content.title': 'Your content',
  'legal.terms.content.p1':
    'What you create or upload stays yours. You allow Rytta to store it and show it to the members of your campaigns, only to run the service.',

  'legal.terms.srd.title': 'Rules content and attribution',
  'legal.terms.srd.p1':
    'The rules text of the glossary and the character tools comes from the System Reference Document, under this notice:',

  'legal.terms.art.title': 'Illustrations',
  'legal.terms.art.p1':
    'The illustrations of the interface were generated for Rytta and belong to Rytta. They may not be reused as a separate collection without permission.',

  'legal.terms.end.title': 'Ending your use',
  'legal.terms.end.p1':
    'You can stop using Rytta and delete your account from Settings at any time. The owner may suspend or remove an account that breaks these terms or puts the service or other people at risk.',

  'legal.terms.liability.title': 'Limitation of liability',
  'legal.terms.liability.p1':
    'To the extent the law allows, the owner is not liable for lost game data, interruptions or indirect damage arising from using Rytta. Nothing here limits rights that the law does not allow to be limited.',

  'legal.terms.law.title': 'Governing law',
  'legal.terms.law.p1':
    'These terms are governed by Spanish law. Disputes will be heard by the courts that correspond under Spanish consumer law.',

  'legal.terms.changes.title': 'Changes and contact',
  'legal.terms.changes.p1':
    'When these terms change, this page and its date change with it. Questions: {{contact}}.',
}
