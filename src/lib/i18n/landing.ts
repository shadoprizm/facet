/**
 * Localized marketing copy for the public landing pages.
 *
 * English lives at `/` (the logged-out homepage); every other locale is
 * statically generated at `/welcome/<locale>`. LOCALES drives the sitemap,
 * hreflang alternates, and the language switcher — add a dictionary here and
 * everything else picks it up.
 */

export type LandingCopy = {
  /** BCP-47 tag used for hreflang + the lang attribute */
  locale: string;
  /** Native name shown in the language switcher */
  nativeName: string;
  dir: "ltr" | "rtl";
  /** <title> for the page */
  title: string;
  /** meta description */
  description: string;
  tagline: string;
  hero: string;
  features: { title: string; body: string }[];
  cta: string;
  signIn: string;
  freeNote: string;
};

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://facet.social";

const en: LandingCopy = {
  locale: "en",
  nativeName: "English",
  dir: "ltr",
  title: "Facet — one root, many masks",
  description:
    "A forum where you speak through personas — separate public masks under one private, verified root — and every community is tended by an AI moderator the members can overrule.",
  tagline: "One root. Many masks.",
  hero: "Facet is a community forum built on two ideas: you shouldn't need one identity for every conversation, and moderation should answer to the community it serves.",
  features: [
    {
      title: "One root, many masks",
      body: "One verified account, known only to the platform. In public you act through personas — each with its own name, avatar, karma, and history. Nobody can link them to each other or to you, yet bans still land on the real you.",
    },
    {
      title: "AI moderators with a constitution",
      body: "Every Room is tended by an AI agent governed by a constitution its members write. It nudges heated threads, folds hostile comments, and escalates to humans — it never bans anyone.",
    },
    {
      title: "The community has the last word",
      body: "Every action the agent takes opens a public vote. Overrule it and the agent recalibrates — moderation that learns from the people it moderates.",
    },
  ],
  cta: "Create your account",
  signIn: "Sign in",
  freeNote: "Free to join. Your email stays private — it is used only for verification and abuse enforcement.",
};

const fr: LandingCopy = {
  locale: "fr",
  nativeName: "Français",
  dir: "ltr",
  title: "Facet — une racine, plusieurs masques",
  description:
    "Un forum où vous vous exprimez à travers des personas — des masques publics distincts reliés à une seule racine privée et vérifiée — et où chaque communauté est veillée par un modérateur IA que les membres peuvent désavouer.",
  tagline: "Une racine. Plusieurs masques.",
  hero: "Facet est un forum communautaire fondé sur deux idées : vous ne devriez pas avoir une seule identité pour toutes vos conversations, et la modération doit rendre des comptes à la communauté qu'elle sert.",
  features: [
    {
      title: "Une racine, plusieurs masques",
      body: "Un seul compte vérifié, connu uniquement de la plateforme. En public, vous agissez à travers des personas — chacun avec son nom, son avatar, son karma et son historique. Personne ne peut les relier entre eux ni à vous, mais les bannissements frappent la vraie personne.",
    },
    {
      title: "Des modérateurs IA dotés d'une constitution",
      body: "Chaque Salle est veillée par un agent IA régi par une constitution rédigée par ses membres. Il apaise les fils qui s'échauffent, replie les commentaires hostiles et escalade vers des humains — il ne bannit jamais personne.",
    },
    {
      title: "La communauté a le dernier mot",
      body: "Chaque action de l'agent ouvre un vote public. Désavouez-le et l'agent se recalibre — une modération qui apprend des personnes qu'elle modère.",
    },
  ],
  cta: "Créer votre compte",
  signIn: "Se connecter",
  freeNote: "Inscription gratuite. Votre courriel reste privé — il ne sert qu'à la vérification et à la lutte contre les abus.",
};

const es: LandingCopy = {
  locale: "es",
  nativeName: "Español",
  dir: "ltr",
  title: "Facet — una raíz, muchas máscaras",
  description:
    "Un foro donde hablas a través de personas — máscaras públicas separadas bajo una única raíz privada y verificada — y cada comunidad es cuidada por un moderador de IA al que sus miembros pueden revocar.",
  tagline: "Una raíz. Muchas máscaras.",
  hero: "Facet es un foro comunitario construido sobre dos ideas: no deberías necesitar una sola identidad para todas tus conversaciones, y la moderación debe responder ante la comunidad a la que sirve.",
  features: [
    {
      title: "Una raíz, muchas máscaras",
      body: "Una sola cuenta verificada, conocida solo por la plataforma. En público actúas a través de personas — cada una con su nombre, avatar, karma e historial. Nadie puede vincularlas entre sí ni contigo, pero las expulsiones recaen sobre la persona real.",
    },
    {
      title: "Moderadores de IA con una constitución",
      body: "Cada Sala es cuidada por un agente de IA regido por una constitución escrita por sus miembros. Calma los hilos acalorados, pliega los comentarios hostiles y escala a humanos — nunca expulsa a nadie.",
    },
    {
      title: "La comunidad tiene la última palabra",
      body: "Cada acción del agente abre una votación pública. Revócala y el agente se recalibra — una moderación que aprende de las personas a las que modera.",
    },
  ],
  cta: "Crea tu cuenta",
  signIn: "Iniciar sesión",
  freeNote: "Unirse es gratis. Tu correo permanece privado — solo se usa para verificación y contra los abusos.",
};

const de: LandingCopy = {
  locale: "de",
  nativeName: "Deutsch",
  dir: "ltr",
  title: "Facet — eine Wurzel, viele Masken",
  description:
    "Ein Forum, in dem du durch Personas sprichst — getrennte öffentliche Masken unter einer privaten, verifizierten Wurzel — und jede Community von einem KI-Moderator betreut wird, den die Mitglieder überstimmen können.",
  tagline: "Eine Wurzel. Viele Masken.",
  hero: "Facet ist ein Community-Forum, das auf zwei Ideen beruht: Du solltest nicht eine Identität für jedes Gespräch brauchen, und Moderation muss sich vor der Community verantworten, der sie dient.",
  features: [
    {
      title: "Eine Wurzel, viele Masken",
      body: "Ein verifiziertes Konto, das nur die Plattform kennt. Öffentlich handelst du durch Personas — jede mit eigenem Namen, Avatar, Karma und Verlauf. Niemand kann sie miteinander oder mit dir verknüpfen, doch Sperren treffen die echte Person.",
    },
    {
      title: "KI-Moderatoren mit einer Verfassung",
      body: "Jeder Raum wird von einem KI-Agenten betreut, der einer von den Mitgliedern geschriebenen Verfassung folgt. Er beruhigt hitzige Threads, klappt feindselige Kommentare ein und eskaliert an Menschen — er sperrt niemanden.",
    },
    {
      title: "Die Community hat das letzte Wort",
      body: "Jede Aktion des Agenten eröffnet eine öffentliche Abstimmung. Überstimme ihn, und der Agent kalibriert sich neu — Moderation, die von den Menschen lernt, die sie moderiert.",
    },
  ],
  cta: "Konto erstellen",
  signIn: "Anmelden",
  freeNote: "Kostenlos. Deine E-Mail bleibt privat — sie dient nur der Verifizierung und der Missbrauchsbekämpfung.",
};

const it: LandingCopy = {
  locale: "it",
  nativeName: "Italiano",
  dir: "ltr",
  title: "Facet — una radice, molte maschere",
  description:
    "Un forum dove parli attraverso personas — maschere pubbliche separate sotto un'unica radice privata e verificata — e ogni comunità è curata da un moderatore IA che i membri possono ribaltare.",
  tagline: "Una radice. Molte maschere.",
  hero: "Facet è un forum comunitario costruito su due idee: non dovresti avere una sola identità per ogni conversazione, e la moderazione deve rispondere alla comunità che serve.",
  features: [
    {
      title: "Una radice, molte maschere",
      body: "Un solo account verificato, noto solo alla piattaforma. In pubblico agisci attraverso personas — ognuna con nome, avatar, karma e cronologia propri. Nessuno può collegarle tra loro o a te, ma i ban colpiscono la persona reale.",
    },
    {
      title: "Moderatori IA con una costituzione",
      body: "Ogni Stanza è curata da un agente IA governato da una costituzione scritta dai membri. Calma le discussioni accese, ripiega i commenti ostili e passa la palla agli umani — non banna mai nessuno.",
    },
    {
      title: "L'ultima parola spetta alla comunità",
      body: "Ogni azione dell'agente apre una votazione pubblica. Ribaltala e l'agente si ricalibra — una moderazione che impara dalle persone che modera.",
    },
  ],
  cta: "Crea il tuo account",
  signIn: "Accedi",
  freeNote: "Iscriversi è gratis. La tua email resta privata — serve solo per la verifica e il contrasto agli abusi.",
};

const pt: LandingCopy = {
  locale: "pt",
  nativeName: "Português",
  dir: "ltr",
  title: "Facet — uma raiz, muitas máscaras",
  description:
    "Um fórum onde você fala através de personas — máscaras públicas separadas sob uma única raiz privada e verificada — e cada comunidade é cuidada por um moderador de IA que os membros podem derrubar.",
  tagline: "Uma raiz. Muitas máscaras.",
  hero: "O Facet é um fórum comunitário construído sobre duas ideias: você não deveria precisar de uma única identidade para todas as conversas, e a moderação deve prestar contas à comunidade que serve.",
  features: [
    {
      title: "Uma raiz, muitas máscaras",
      body: "Uma única conta verificada, conhecida apenas pela plataforma. Em público, você age através de personas — cada uma com nome, avatar, karma e histórico próprios. Ninguém consegue ligá-las entre si ou a você, mas os banimentos atingem a pessoa real.",
    },
    {
      title: "Moderadores de IA com uma constituição",
      body: "Cada Sala é cuidada por um agente de IA regido por uma constituição escrita pelos membros. Ele acalma discussões acaloradas, recolhe comentários hostis e escala para humanos — nunca bane ninguém.",
    },
    {
      title: "A comunidade tem a palavra final",
      body: "Cada ação do agente abre uma votação pública. Derrube a decisão e o agente se recalibra — uma moderação que aprende com as pessoas que modera.",
    },
  ],
  cta: "Crie sua conta",
  signIn: "Entrar",
  freeNote: "Grátis para participar. Seu e-mail permanece privado — é usado apenas para verificação e combate a abusos.",
};

const nl: LandingCopy = {
  locale: "nl",
  nativeName: "Nederlands",
  dir: "ltr",
  title: "Facet — één wortel, vele maskers",
  description:
    "Een forum waar je spreekt via personas — gescheiden publieke maskers onder één private, geverifieerde wortel — en elke community wordt verzorgd door een AI-moderator die de leden kunnen terugfluiten.",
  tagline: "Eén wortel. Vele maskers.",
  hero: "Facet is een communityforum gebouwd op twee ideeën: je zou niet één identiteit nodig moeten hebben voor elk gesprek, en moderatie hoort verantwoording af te leggen aan de community die ze dient.",
  features: [
    {
      title: "Eén wortel, vele maskers",
      body: "Eén geverifieerd account, alleen bekend bij het platform. In het openbaar handel je via personas — elk met een eigen naam, avatar, karma en geschiedenis. Niemand kan ze aan elkaar of aan jou koppelen, maar een ban raakt de echte persoon.",
    },
    {
      title: "AI-moderators met een grondwet",
      body: "Elke Kamer wordt verzorgd door een AI-agent die een door de leden geschreven grondwet volgt. Hij kalmeert verhitte discussies, klapt vijandige reacties in en escaleert naar mensen — hij verbant nooit iemand.",
    },
    {
      title: "De community heeft het laatste woord",
      body: "Elke actie van de agent opent een publieke stemming. Fluit hem terug en de agent kalibreert zich opnieuw — moderatie die leert van de mensen die ze modereert.",
    },
  ],
  cta: "Maak je account aan",
  signIn: "Inloggen",
  freeNote: "Gratis om mee te doen. Je e-mailadres blijft privé — het wordt alleen gebruikt voor verificatie en het bestrijden van misbruik.",
};

const pl: LandingCopy = {
  locale: "pl",
  nativeName: "Polski",
  dir: "ltr",
  title: "Facet — jeden korzeń, wiele masek",
  description:
    "Forum, na którym mówisz przez persony — oddzielne publiczne maski pod jednym prywatnym, zweryfikowanym korzeniem — a każdą społecznością opiekuje się moderator AI, którego członkowie mogą uchylić.",
  tagline: "Jeden korzeń. Wiele masek.",
  hero: "Facet to forum społecznościowe oparte na dwóch ideach: nie powinieneś potrzebować jednej tożsamości do każdej rozmowy, a moderacja musi odpowiadać przed społecznością, której służy.",
  features: [
    {
      title: "Jeden korzeń, wiele masek",
      body: "Jedno zweryfikowane konto, znane tylko platformie. Publicznie działasz przez persony — każda z własną nazwą, awatarem, karmą i historią. Nikt nie może ich powiązać ze sobą ani z tobą, ale bany trafiają w prawdziwą osobę.",
    },
    {
      title: "Moderatorzy AI z konstytucją",
      body: "Każdym Pokojem opiekuje się agent AI kierujący się konstytucją napisaną przez członków. Studzi gorące wątki, zwija wrogie komentarze i eskaluje do ludzi — nigdy nikogo nie banuje.",
    },
    {
      title: "Ostatnie słowo należy do społeczności",
      body: "Każde działanie agenta otwiera publiczne głosowanie. Uchyl je, a agent się przekalibruje — moderacja, która uczy się od ludzi, których moderuje.",
    },
  ],
  cta: "Załóż konto",
  signIn: "Zaloguj się",
  freeNote: "Dołączenie jest darmowe. Twój e-mail pozostaje prywatny — służy wyłącznie weryfikacji i zwalczaniu nadużyć.",
};

const tr: LandingCopy = {
  locale: "tr",
  nativeName: "Türkçe",
  dir: "ltr",
  title: "Facet — tek kök, birçok maske",
  description:
    "Personalar aracılığıyla konuştuğunuz bir forum — tek bir özel, doğrulanmış kökün altında ayrı kamusal maskeler — ve her topluluk, üyelerin kararını bozabileceği bir yapay zekâ moderatörü tarafından gözetilir.",
  tagline: "Tek kök. Birçok maske.",
  hero: "Facet iki fikir üzerine kurulu bir topluluk forumudur: her sohbet için tek bir kimliğe ihtiyacınız olmamalı ve moderasyon hizmet ettiği topluluğa hesap vermelidir.",
  features: [
    {
      title: "Tek kök, birçok maske",
      body: "Yalnızca platformun bildiği tek bir doğrulanmış hesap. Kamuya açık alanda personalar aracılığıyla hareket edersiniz — her birinin kendi adı, avatarı, karması ve geçmişi vardır. Kimse onları birbirine ya da size bağlayamaz; ama yasaklar gerçek kişiye işler.",
    },
    {
      title: "Anayasalı yapay zekâ moderatörleri",
      body: "Her Oda, üyelerin yazdığı bir anayasaya bağlı bir yapay zekâ ajanı tarafından gözetilir. Kızışan tartışmaları yatıştırır, düşmanca yorumları katlar ve insanlara iletir — asla kimseyi yasaklamaz.",
    },
    {
      title: "Son söz topluluğundur",
      body: "Ajanın her eylemi halka açık bir oylama başlatır. Kararı bozun, ajan kendini yeniden ayarlar — modere ettiği insanlardan öğrenen bir moderasyon.",
    },
  ],
  cta: "Hesabını oluştur",
  signIn: "Giriş yap",
  freeNote: "Katılım ücretsizdir. E-postanız gizli kalır — yalnızca doğrulama ve kötüye kullanımla mücadele için kullanılır.",
};

const ru: LandingCopy = {
  locale: "ru",
  nativeName: "Русский",
  dir: "ltr",
  title: "Facet — один корень, много масок",
  description:
    "Форум, где вы говорите через персоны — отдельные публичные маски под одним приватным подтверждённым корнем, — а за каждым сообществом присматривает ИИ-модератор, решения которого участники могут отменить.",
  tagline: "Один корень. Много масок.",
  hero: "Facet — это форум, построенный на двух идеях: вам не нужна одна личность для всех разговоров, а модерация должна отвечать перед сообществом, которому служит.",
  features: [
    {
      title: "Один корень, много масок",
      body: "Один подтверждённый аккаунт, известный только платформе. Публично вы действуете через персоны — у каждой своё имя, аватар, карма и история. Никто не может связать их друг с другом или с вами, но баны бьют по реальному человеку.",
    },
    {
      title: "ИИ-модераторы с конституцией",
      body: "За каждой Комнатой присматривает ИИ-агент, руководствующийся конституцией, написанной участниками. Он остужает горячие ветки, сворачивает враждебные комментарии и передаёт спорное людям — и никогда никого не банит.",
    },
    {
      title: "Последнее слово — за сообществом",
      body: "Каждое действие агента открывает публичное голосование. Отмените его — и агент перенастроится. Модерация, которая учится у тех, кого модерирует.",
    },
  ],
  cta: "Создать аккаунт",
  signIn: "Войти",
  freeNote: "Регистрация бесплатна. Ваш e-mail остаётся приватным — он используется только для подтверждения и борьбы со злоупотреблениями.",
};

const uk: LandingCopy = {
  locale: "uk",
  nativeName: "Українська",
  dir: "ltr",
  title: "Facet — один корінь, багато масок",
  description:
    "Форум, де ви говорите через персони — окремі публічні маски під одним приватним підтвердженим коренем, — а за кожною спільнотою доглядає ШІ-модератор, рішення якого учасники можуть скасувати.",
  tagline: "Один корінь. Багато масок.",
  hero: "Facet — це форум, побудований на двох ідеях: вам не потрібна одна ідентичність для всіх розмов, а модерація має відповідати перед спільнотою, якій служить.",
  features: [
    {
      title: "Один корінь, багато масок",
      body: "Один підтверджений акаунт, відомий лише платформі. Публічно ви дієте через персони — кожна з власним іменем, аватаром, кармою та історією. Ніхто не може пов'язати їх між собою чи з вами, але бани влучають у реальну людину.",
    },
    {
      title: "ШІ-модератори з конституцією",
      body: "За кожною Кімнатою доглядає ШІ-агент, що керується конституцією, написаною учасниками. Він охолоджує гарячі гілки, згортає ворожі коментарі та передає складне людям — і ніколи нікого не банить.",
    },
    {
      title: "Останнє слово — за спільнотою",
      body: "Кожна дія агента відкриває публічне голосування. Скасуйте її — і агент перелаштується. Модерація, що вчиться в тих, кого модерує.",
    },
  ],
  cta: "Створити акаунт",
  signIn: "Увійти",
  freeNote: "Приєднання безкоштовне. Ваш e-mail залишається приватним — він потрібен лише для підтвердження та боротьби зі зловживаннями.",
};

const ar: LandingCopy = {
  locale: "ar",
  nativeName: "العربية",
  dir: "rtl",
  title: "Facet — جذر واحد، أقنعة كثيرة",
  description:
    "منتدى تتحدث فيه عبر شخصيات — أقنعة عامة منفصلة تحت جذر واحد خاص وموثَّق — وكل مجتمع يرعاه مشرف ذكاء اصطناعي يمكن للأعضاء نقض قراراته.",
  tagline: "جذر واحد. أقنعة كثيرة.",
  hero: "Facet منتدى مجتمعي مبني على فكرتين: لا ينبغي أن تحتاج إلى هوية واحدة لكل محادثة، ويجب أن يخضع الإشراف لمساءلة المجتمع الذي يخدمه.",
  features: [
    {
      title: "جذر واحد، أقنعة كثيرة",
      body: "حساب واحد موثَّق لا تعرفه إلا المنصة. في العلن تتصرف عبر شخصيات — لكل منها اسمها وصورتها ورصيدها وسجلها. لا يستطيع أحد الربط بينها أو بينك، لكن الحظر يقع على الشخص الحقيقي.",
    },
    {
      title: "مشرفو ذكاء اصطناعي بدستور",
      body: "كل غرفة يرعاها وكيل ذكاء اصطناعي يحكمه دستور يكتبه الأعضاء. يهدّئ النقاشات المحتدمة، ويطوي التعليقات العدائية، ويرفع الأمر إلى البشر — ولا يحظر أحدًا أبدًا.",
    },
    {
      title: "الكلمة الأخيرة للمجتمع",
      body: "كل إجراء يتخذه الوكيل يفتح تصويتًا عامًا. انقضه فيعيد الوكيل معايرة نفسه — إشراف يتعلم من الناس الذين يشرف عليهم.",
    },
  ],
  cta: "أنشئ حسابك",
  signIn: "تسجيل الدخول",
  freeNote: "الانضمام مجاني. بريدك الإلكتروني يبقى خاصًا — يُستخدم فقط للتحقق ومكافحة الإساءة.",
};

const hi: LandingCopy = {
  locale: "hi",
  nativeName: "हिन्दी",
  dir: "ltr",
  title: "Facet — एक जड़, कई मुखौटे",
  description:
    "एक फ़ोरम जहाँ आप पर्सोना के ज़रिए बोलते हैं — एक निजी, सत्यापित जड़ के नीचे अलग-अलग सार्वजनिक मुखौटे — और हर समुदाय की देखरेख एक AI मॉडरेटर करता है जिसके फ़ैसले सदस्य पलट सकते हैं।",
  tagline: "एक जड़। कई मुखौटे।",
  hero: "Facet दो विचारों पर बना एक सामुदायिक फ़ोरम है: हर बातचीत के लिए आपको एक ही पहचान की ज़रूरत नहीं होनी चाहिए, और मॉडरेशन उस समुदाय के प्रति जवाबदेह होना चाहिए जिसकी वह सेवा करता है।",
  features: [
    {
      title: "एक जड़, कई मुखौटे",
      body: "एक सत्यापित खाता, जिसे केवल प्लेटफ़ॉर्म जानता है। सार्वजनिक रूप से आप पर्सोना के ज़रिए काम करते हैं — हर एक का अपना नाम, अवतार, कर्मा और इतिहास। कोई उन्हें आपस में या आपसे नहीं जोड़ सकता, फिर भी प्रतिबंध असली व्यक्ति पर लगता है।",
    },
    {
      title: "संविधान वाले AI मॉडरेटर",
      body: "हर Room की देखरेख एक AI एजेंट करता है, जो सदस्यों के लिखे संविधान से चलता है। वह गरम बहसों को शांत करता है, आक्रामक टिप्पणियों को समेटता है और मामले इंसानों तक पहुँचाता है — वह कभी किसी को प्रतिबंधित नहीं करता।",
    },
    {
      title: "आख़िरी फ़ैसला समुदाय का",
      body: "एजेंट की हर कार्रवाई पर सार्वजनिक मतदान खुलता है। उसे पलट दें और एजेंट खुद को फिर से साधता है — ऐसा मॉडरेशन जो उन्हीं लोगों से सीखता है जिनकी वह देखरेख करता है।",
    },
  ],
  cta: "अपना खाता बनाएँ",
  signIn: "साइन इन करें",
  freeNote: "जुड़ना मुफ़्त है। आपका ईमेल निजी रहता है — इसका उपयोग केवल सत्यापन और दुरुपयोग रोकने के लिए होता है।",
};

const id: LandingCopy = {
  locale: "id",
  nativeName: "Bahasa Indonesia",
  dir: "ltr",
  title: "Facet — satu akar, banyak topeng",
  description:
    "Forum tempat Anda berbicara melalui persona — topeng publik terpisah di bawah satu akar privat yang terverifikasi — dan setiap komunitas dijaga oleh moderator AI yang keputusannya dapat dibatalkan anggota.",
  tagline: "Satu akar. Banyak topeng.",
  hero: "Facet adalah forum komunitas yang dibangun di atas dua gagasan: Anda tidak seharusnya butuh satu identitas untuk semua percakapan, dan moderasi harus bertanggung jawab kepada komunitas yang dilayaninya.",
  features: [
    {
      title: "Satu akar, banyak topeng",
      body: "Satu akun terverifikasi, hanya diketahui platform. Di ruang publik Anda bertindak melalui persona — masing-masing dengan nama, avatar, karma, dan riwayatnya sendiri. Tak seorang pun dapat mengaitkannya satu sama lain atau dengan Anda, namun larangan tetap mengenai orang aslinya.",
    },
    {
      title: "Moderator AI dengan konstitusi",
      body: "Setiap Room dijaga oleh agen AI yang tunduk pada konstitusi yang ditulis anggotanya. Ia meredakan utas yang memanas, melipat komentar bermusuhan, dan meneruskan ke manusia — ia tidak pernah memblokir siapa pun.",
    },
    {
      title: "Komunitas punya kata akhir",
      body: "Setiap tindakan agen membuka pemungutan suara publik. Batalkan, dan agen mengkalibrasi ulang dirinya — moderasi yang belajar dari orang-orang yang dimoderasinya.",
    },
  ],
  cta: "Buat akun Anda",
  signIn: "Masuk",
  freeNote: "Gratis untuk bergabung. Email Anda tetap privat — hanya digunakan untuk verifikasi dan penanganan penyalahgunaan.",
};

const ja: LandingCopy = {
  locale: "ja",
  nativeName: "日本語",
  dir: "ltr",
  title: "Facet — ひとつのルート、たくさんのマスク",
  description:
    "ペルソナを通して発言するフォーラム。非公開の認証済みルートの下に、切り離された公開マスクを持ち、各コミュニティはメンバーが覆せるAIモデレーターに見守られています。",
  tagline: "ひとつのルート。たくさんのマスク。",
  hero: "Facetは2つの考えに基づくコミュニティフォーラムです。すべての会話にひとつのアイデンティティは要らない。そしてモデレーションは、それが仕える コミュニティに対して説明責任を負うべきだ、ということ。",
  features: [
    {
      title: "ひとつのルート、たくさんのマスク",
      body: "認証済みアカウントはひとつだけで、プラットフォームしか知りません。公開の場ではペルソナとして行動します。それぞれが独自の名前、アバター、カルマ、履歴を持ち、互いにもあなたにも結びつけられません。それでもBANは本人に届きます。",
    },
    {
      title: "憲章を持つAIモデレーター",
      body: "各Roomは、メンバーが書いた憲章に従うAIエージェントが見守ります。過熱したスレッドをなだめ、敵対的なコメントを折りたたみ、人間へエスカレーションします。誰かをBANすることは決してありません。",
    },
    {
      title: "最終決定はコミュニティに",
      body: "エージェントの行動はすべて公開投票にかけられます。覆せばエージェントは自らを再調整します。モデレートする相手から学ぶモデレーションです。",
    },
  ],
  cta: "アカウントを作成",
  signIn: "サインイン",
  freeNote: "参加は無料。メールアドレスは非公開のまま、本人確認と不正対応にのみ使われます。",
};

const ko: LandingCopy = {
  locale: "ko",
  nativeName: "한국어",
  dir: "ltr",
  title: "Facet — 하나의 뿌리, 여러 개의 가면",
  description:
    "페르소나로 말하는 포럼 — 비공개 인증 뿌리 아래 분리된 공개 가면들 — 그리고 모든 커뮤니티는 구성원이 뒤집을 수 있는 AI 모더레이터가 돌봅니다.",
  tagline: "하나의 뿌리. 여러 개의 가면.",
  hero: "Facet은 두 가지 생각 위에 세워진 커뮤니티 포럼입니다. 모든 대화에 하나의 정체성이 필요하지 않으며, 모더레이션은 그것이 섬기는 커뮤니티에 책임을 져야 한다는 것입니다.",
  features: [
    {
      title: "하나의 뿌리, 여러 개의 가면",
      body: "플랫폼만 아는 하나의 인증 계정. 공개적으로는 페르소나로 활동합니다 — 각자 고유한 이름, 아바타, 카르마, 기록을 가집니다. 누구도 서로를, 혹은 당신을 연결할 수 없지만 차단은 실제 사람에게 적용됩니다.",
    },
    {
      title: "헌장을 가진 AI 모더레이터",
      body: "모든 Room은 구성원이 작성한 헌장을 따르는 AI 에이전트가 돌봅니다. 과열된 스레드를 진정시키고, 적대적인 댓글을 접고, 사람에게 넘깁니다 — 결코 누구도 차단하지 않습니다.",
    },
    {
      title: "마지막 결정은 커뮤니티가",
      body: "에이전트의 모든 조치는 공개 투표에 부쳐집니다. 뒤집으면 에이전트는 스스로를 재조정합니다 — 자신이 돌보는 사람들에게서 배우는 모더레이션입니다.",
    },
  ],
  cta: "계정 만들기",
  signIn: "로그인",
  freeNote: "가입은 무료입니다. 이메일은 비공개로 유지되며 인증과 악용 방지에만 사용됩니다.",
};

const zh: LandingCopy = {
  locale: "zh",
  nativeName: "简体中文",
  dir: "ltr",
  title: "Facet — 一个根，多重面具",
  description:
    "一个通过角色面具发言的论坛——在一个私密且经过验证的根账号之下，拥有彼此独立的公开面具——每个社区都由一位成员可以推翻其决定的 AI 版主守护。",
  tagline: "一个根。多重面具。",
  hero: "Facet 是一个建立在两个理念之上的社区论坛：你不该用同一个身份应对所有对话；而管理应当对它所服务的社区负责。",
  features: [
    {
      title: "一个根，多重面具",
      body: "只有平台知道的唯一验证账号。在公开场合，你通过角色面具行动——每个面具都有自己的名字、头像、声望和历史。没有人能把它们彼此关联或关联到你，但封禁仍会落在真实的人身上。",
    },
    {
      title: "拥有章程的 AI 版主",
      body: "每个房间都由一位 AI 智能体守护，它遵循由成员共同撰写的章程。它会给激烈的讨论降温、折叠恶意评论、把问题上报给人类——但它从不封禁任何人。",
    },
    {
      title: "社区拥有最终决定权",
      body: "智能体的每一次行动都会发起公开投票。推翻它，它就会重新校准——这是向被管理者学习的社区管理。",
    },
  ],
  cta: "创建账号",
  signIn: "登录",
  freeNote: "免费加入。你的邮箱保持私密——仅用于验证与滥用治理。",
};

const vi: LandingCopy = {
  locale: "vi",
  nativeName: "Tiếng Việt",
  dir: "ltr",
  title: "Facet — một gốc, nhiều mặt nạ",
  description:
    "Một diễn đàn nơi bạn lên tiếng qua các persona — những chiếc mặt nạ công khai tách biệt dưới một gốc riêng tư đã xác minh — và mỗi cộng đồng được một người điều phối AI chăm sóc, thành viên có quyền lật ngược quyết định của nó.",
  tagline: "Một gốc. Nhiều mặt nạ.",
  hero: "Facet là diễn đàn cộng đồng xây trên hai ý tưởng: bạn không cần một danh tính duy nhất cho mọi cuộc trò chuyện, và việc điều phối phải chịu trách nhiệm trước cộng đồng mà nó phục vụ.",
  features: [
    {
      title: "Một gốc, nhiều mặt nạ",
      body: "Một tài khoản xác minh duy nhất, chỉ nền tảng biết. Trước công chúng, bạn hành động qua các persona — mỗi persona có tên, ảnh đại diện, karma và lịch sử riêng. Không ai có thể liên kết chúng với nhau hay với bạn, nhưng lệnh cấm vẫn nhắm vào con người thật.",
    },
    {
      title: "Người điều phối AI có hiến chương",
      body: "Mỗi Phòng được một tác nhân AI chăm sóc, tuân theo hiến chương do thành viên soạn. Nó hạ nhiệt các luồng tranh luận nóng, thu gọn bình luận thù địch và chuyển lên con người — nó không bao giờ cấm ai.",
    },
    {
      title: "Cộng đồng có tiếng nói cuối cùng",
      body: "Mỗi hành động của tác nhân đều mở một cuộc bỏ phiếu công khai. Lật ngược nó và tác nhân tự hiệu chỉnh lại — sự điều phối học hỏi từ chính những người nó điều phối.",
    },
  ],
  cta: "Tạo tài khoản",
  signIn: "Đăng nhập",
  freeNote: "Tham gia miễn phí. Email của bạn được giữ kín — chỉ dùng để xác minh và xử lý lạm dụng.",
};

/** English first; order here is the order in the language switcher. */
export const LANDING_LOCALES: LandingCopy[] = [
  en, fr, es, de, it, pt, nl, pl, tr, ru, uk, ar, hi, id, vi, ja, ko, zh,
];

export const DEFAULT_LOCALE = en;

export function getLandingCopy(locale: string): LandingCopy | undefined {
  return LANDING_LOCALES.find((l) => l.locale === locale);
}

/**
 * hreflang map shared by the sitemap and page metadata. English lives at `/`,
 * every other locale at `/welcome/<locale>`.
 */
export function hreflangAlternates(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const l of LANDING_LOCALES) {
    map[l.locale] = l.locale === "en" ? `${SITE_URL}/` : `${SITE_URL}/welcome/${l.locale}`;
  }
  map["x-default"] = `${SITE_URL}/`;
  return map;
}
