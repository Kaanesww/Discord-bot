import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { motion, Variants } from 'framer-motion';
import { 
  Shield, 
  TrendingUp, 
  Dices, 
  Server, 
  Flame, 
  Crosshair, 
  Coins, 
  ChevronRight,
  Swords,
  Skull,
  Terminal
} from 'lucide-react';
import React from 'react';

const queryClient = new QueryClient();

const INVITE_LINK = "https://discord.com/api/oauth2/authorize?client_id=1484845151989010473&permissions=8&scope=bot+applications.commands";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

// --- Components ---

const Button = ({ children, className = '', href, variant = 'primary' }: any) => {
  const baseStyle = "inline-flex items-center justify-center font-display font-bold uppercase tracking-wider transition-all duration-300 rounded-none relative overflow-hidden group";
  const variants = {
    primary: "bg-primary text-white px-8 py-4 text-lg glow-box border border-primary",
    secondary: "bg-transparent text-white px-8 py-4 border border-white/20 hover:border-white/60",
    outline: "bg-transparent border border-primary text-primary px-6 py-3 hover:bg-primary/10"
  };
  
  const content = (
    <>
      <span className="relative z-10 flex items-center gap-2">{children}</span>
      {variant === 'primary' && (
        <div className="absolute inset-0 bg-white/20 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300 ease-in-out z-0"></div>
      )}
    </>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={`${baseStyle} ${variants[variant as keyof typeof variants]} ${className}`}>
        {content}
      </a>
    );
  }
  return <button className={`${baseStyle} ${variants[variant as keyof typeof variants]} ${className}`}>{content}</button>;
};

function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/20 border border-primary flex items-center justify-center rounded-sm">
            <Flame className="w-6 h-6 text-primary" />
          </div>
          <span className="font-display font-bold text-2xl tracking-widest glow-text">VBRI</span>
        </div>
        <Button href={INVITE_LINK} variant="outline" className="hidden sm:inline-flex">
          BOTA DAVET ET
        </Button>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative pt-40 pb-20 px-6 min-h-[90vh] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30"></div>
      <div className="max-w-5xl mx-auto text-center relative z-10">
        <motion.div initial="hidden" animate="show" variants={staggerContainer}>
          <motion.div variants={fadeUp} className="mb-6 inline-flex items-center gap-2 border border-primary/30 bg-primary/10 px-4 py-2 rounded-full text-sm font-medium text-primary">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Sistem Aktif ve Operasyonel
          </motion.div>
          <motion.h1 variants={fadeUp} className="text-6xl sm:text-7xl md:text-8xl font-black leading-[0.9] mb-8">
            SUNUCUNUZA <br/> <span className="text-primary glow-text">HÜKMEDİN.</span>
          </motion.h1>
          <motion.p variants={fadeUp} className="text-xl sm:text-2xl text-white/60 max-w-3xl mx-auto mb-12 font-sans font-medium">
            Acımasız bir düzen. Eğlenceli bir kaos. OWO tarzı ekonomi, yargısız infaz moderasyonu ve rekabetçi level sistemiyle VBRI, Discord topluluğunuzun yeni hakimi.
          </motion.p>
          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Button href={INVITE_LINK} variant="primary">
              BOTA DAVET ET <ChevronRight className="w-5 h-5" />
            </Button>
            <Button href="#commands" variant="secondary">
              KOMUTLARI İNCELE
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function Marquee() {
  const commands = ["/nuke", "/blackjack", "/sunucukur", "/duel", "/ban", "/coinflip", "/rulet", "/temizle", "/sicil", "/kumar"];
  // Duplicate for seamless loop
  const displayCommands = [...commands, ...commands];

  return (
    <div className="py-12 border-y border-white/5 bg-white/[0.02]">
      <div className="marquee-container">
        <div className="marquee-content gap-12">
          {displayCommands.map((cmd, i) => (
            <div key={i} className="flex items-center gap-4 text-3xl font-display font-bold text-white/20 whitespace-nowrap">
              <span className="text-primary/50">{cmd}</span>
              <span className="w-2 h-2 rounded-full bg-white/10"></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc, delay = 0 }: any) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6, delay }}
      className="group relative border border-white/10 bg-black/40 backdrop-blur-sm p-8 overflow-hidden hover:border-primary/50 transition-colors"
    >
      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
        <Icon className="w-48 h-48 text-primary rotate-12 translate-x-12 -translate-y-12" />
      </div>
      <div className="relative z-10">
        <div className="w-14 h-14 border border-primary/30 bg-primary/10 flex items-center justify-center mb-8 text-primary group-hover:scale-110 transition-transform">
          <Icon className="w-7 h-7" />
        </div>
        <h3 className="text-2xl font-bold mb-4">{title}</h3>
        <p className="text-white/60 font-sans leading-relaxed text-lg">{desc}</p>
      </div>
    </motion.div>
  );
}

function Features() {
  return (
    <section className="py-32 px-6 relative">
      <div className="max-w-7xl mx-auto">
        <div className="mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">HER ŞEY TEK YERDE.<br/><span className="text-white/40">GÜÇ SENİN ELLERİNDE.</span></h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FeatureCard 
            icon={Skull} 
            title="ACIMASIZ MODERASYON" 
            desc="Kuralları sen koy, VBRI yargılasın. Gelişmiş sicil sistemi, toplu temizlik ve tavizsiz cezalandırma araçlarıyla sunucun her zaman güvende."
            delay={0.1}
          />
          <FeatureCard 
            icon={Coins} 
            title="GLOBAL EKONOMİ" 
            desc="Tüm VBRI sunucularında geçerli ortak bakiye. Günlük ödüllerle birikim yap, transferlerle ticaret ağını kur."
            delay={0.2}
          />
          <FeatureCard 
            icon={Dices} 
            title="TEHLİKELİ OYUNLAR" 
            desc="Risk al, zengin ol. OWO tarzı coinflip, solo veya 1v1 blackjack, rulet ve zar oyunlarıyla ekonomini katla (veya her şeyini kaybet)."
            delay={0.3}
          />
          <FeatureCard 
            icon={TrendingUp} 
            title="REKABETÇİ LEVEL" 
            desc="Topluluğunda rekabeti körükle. Özelleştirilmiş level kartları, liderlik tabloları ve otomatik rol ödülleriyle aktifliği zirveye taşı."
            delay={0.4}
          />
        </div>
      </div>
    </section>
  );
}

function Showcase() {
  return (
    <section className="py-24 px-6 border-y border-white/5 bg-white/[0.01]">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div>
          <h2 className="text-4xl font-bold mb-6">SÖZDE DEĞİL,<br/><span className="text-primary glow-text">EYLEMDE GÜÇLÜ.</span></h2>
          <p className="text-xl text-white/60 font-sans mb-8">
            VBRI sıradan bir bot değil. Emir verdiğinde sorgulamaz, sadece uygular. Eğlence ve disiplin aynı anda sunucunuzda.
          </p>
          <ul className="space-y-4 font-sans text-lg text-white/80">
            <li className="flex items-center gap-3"><Crosshair className="w-6 h-6 text-primary" /> Hızlı reaksiyon süresi</li>
            <li className="flex items-center gap-3"><Swords className="w-6 h-6 text-primary" /> Kesintisiz ekonomi rekabeti</li>
            <li className="flex items-center gap-3"><Server className="w-6 h-6 text-primary" /> Saniyeler içinde sunucu kurulumu</li>
          </ul>
        </div>

        <div className="space-y-6">
          {/* Discord Message 1 */}
          <div className="border border-white/10 bg-black/60 p-6 rounded-sm shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
            <div className="flex gap-4 items-start font-sans">
              <div className="w-12 h-12 bg-red-500/20 flex items-center justify-center border border-red-500/30 shrink-0">
                <Skull className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-red-500 font-display tracking-wide text-lg">VBRI</span>
                  <span className="bg-[#5865F2] text-white text-[10px] px-1.5 py-0.5 rounded-sm uppercase font-bold tracking-wider">BOT</span>
                  <span className="text-xs text-white/40">Bugün 03:00</span>
                </div>
                <div className="mt-2 space-y-3">
                  <p className="text-white/90">Kullanıcı <span className="text-blue-400 font-semibold bg-blue-400/10 px-1 rounded">@toxic_user</span> sunucudan başarıyla silindi.</p>
                  <div className="bg-red-500/10 border-l-2 border-red-500 p-3 text-sm text-white/80">
                    <span className="font-semibold text-red-400">Sebep:</span> Hiyerarşiye saygısızlık. Acıma yok.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Discord Message 2 */}
          <div className="border border-white/10 bg-black/60 p-6 rounded-sm shadow-2xl relative overflow-hidden ml-8">
            <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
            <div className="flex gap-4 items-start font-sans">
              <div className="w-12 h-12 bg-green-500/20 flex items-center justify-center border border-green-500/30 shrink-0">
                <Coins className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-green-500 font-display tracking-wide text-lg">VBRI</span>
                  <span className="bg-[#5865F2] text-white text-[10px] px-1.5 py-0.5 rounded-sm uppercase font-bold tracking-wider">BOT</span>
                  <span className="text-xs text-white/40">Bugün 03:05</span>
                </div>
                <div className="mt-2 space-y-3">
                  <p className="text-white/90">Tura geldi! <span className="text-blue-400 font-semibold bg-blue-400/10 px-1 rounded">@risk_taker</span> kazandı.</p>
                  <div className="bg-green-500/10 border border-green-500/20 p-3 text-sm text-white/80 flex items-center justify-between">
                    <span>Kazanılan: <span className="font-bold text-green-400">10,000 🪙</span></span>
                    <span className="text-white/50 text-xs">Yeni Bakiye: 45,200 🪙</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const COMMAND_CATEGORIES = [
  {
    name: "MODERASYON",
    count: 13,
    icon: Shield,
    commands: ["/ban", "/kick", "/warn", "/timeout", "/untimeout", "/unban", "/uyarikaldir", "/kilitle", "/ac", "/temizle", "/nuke", "/sicil", "/kullanicibilgi"]
  },
  {
    name: "LEVEL SİSTEMİ",
    count: 7,
    icon: TrendingUp,
    commands: ["level kartı", "leaderboard", "profil", "levelrol ekle", "levelrol liste", "levelrol kaldır"]
  },
  {
    name: "EKONOMİ",
    count: 6,
    icon: Coins,
    desc: "Tüm sunucularda geçerli global bakiye",
    commands: ["/gunlukodul", "/bakiye", "/transfer", "/kumar", "/duel", "/rulet"]
  },
  {
    name: "OYUNLAR",
    count: 6,
    icon: Dices,
    commands: ["/coinflip", "/blackjack", "/rps", "/patla", "/zar", "/8top"]
  },
  {
    name: "SUNUCU YÖNETİMİ",
    count: 6,
    icon: Server,
    commands: ["/sunucukur", "/sunucukopyala", "/setprefix", "/ping", "/kullanicibilgi", "yardım"]
  }
];

function CommandsRegistry() {
  return (
    <section id="commands" className="py-32 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <Terminal className="w-12 h-12 text-primary mx-auto mb-6" />
          <h2 className="text-4xl md:text-5xl font-bold mb-4">KOMUT CEPHANESİ</h2>
          <p className="text-xl text-white/60 font-sans max-w-2xl mx-auto">
            İhtiyacın olan her araç burada. Hazır ve emrine amade. Toplam 38 tam teşekküllü komut.
          </p>
        </div>

        <div className="space-y-12">
          {COMMAND_CATEGORIES.map((category, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              className="border border-white/10 bg-black/40 p-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-white/10 pb-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/5 text-primary border border-white/10">
                    <category.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold flex items-center gap-3">
                      {category.name}
                      <span className="text-sm px-2 py-1 bg-white/10 text-white/70 font-sans font-medium rounded-sm">
                        {category.count} KOMUT
                      </span>
                    </h3>
                    {category.desc && <p className="text-white/50 font-sans mt-1">{category.desc}</p>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 font-sans">
                {category.commands.map((cmd, i) => (
                  <div key={i} className="bg-white/5 border border-white/5 px-3 py-2 text-center text-sm font-medium text-white/80 hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors cursor-default truncate">
                    {cmd}
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="py-32 px-6 relative border-t border-primary/20 overflow-hidden">
      <div className="absolute inset-0 bg-primary/5"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/20 blur-[150px] rounded-full z-0 pointer-events-none mix-blend-screen"></div>
      
      <div className="max-w-4xl mx-auto text-center relative z-10">
        <h2 className="text-5xl md:text-7xl font-black mb-6 leading-tight">
          SUNUCUN İÇİN YENİ BİR <span className="text-primary glow-text">ÇAĞ BAŞLIYOR.</span>
        </h2>
        <p className="text-xl text-white/70 font-sans mb-12 max-w-2xl mx-auto">
          Zaman kaybetme. Gücü hemen şimdi eline al ve topluluğunu bir sonraki seviyeye taşı.
        </p>
        <Button href={INVITE_LINK} variant="primary" className="text-2xl px-12 py-6">
          ŞİMDİ BOTA DAVET ET
        </Button>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="py-12 px-6 border-t border-white/10 bg-black text-center font-sans">
      <div className="flex items-center justify-center gap-3 mb-6">
        <Flame className="w-6 h-6 text-primary" />
        <span className="font-display font-bold text-2xl tracking-widest text-white/50">VBRI</span>
      </div>
      <p className="text-white/40 mb-2">Tüm hakları saklıdır &copy; {new Date().getFullYear()}</p>
      <p className="text-white/30 text-sm">Discord sunucuları için karanlıkta parlayan yegane güç.</p>
    </footer>
  );
}

// --- Main App ---

function Home() {
  return (
    <div className="min-h-screen w-full bg-background text-foreground overflow-x-hidden selection:bg-primary/30 selection:text-white relative">
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-50 mix-blend-overlay" 
           style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>
      <div className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-primary/10 blur-[150px] rounded-full mix-blend-screen"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-primary/5 blur-[120px] rounded-full mix-blend-screen"></div>
      </div>
      
      <div className="relative z-10">
        <Navbar />
        <Hero />
        <Marquee />
        <Features />
        <Showcase />
        <CommandsRegistry />
        <CTA />
        <Footer />
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route>
        <div className="min-h-screen flex items-center justify-center text-white/50 font-sans">
          Sayfa bulunamadı.
        </div>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
