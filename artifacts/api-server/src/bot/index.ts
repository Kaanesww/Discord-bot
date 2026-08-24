ımına açıktır.")
          .addFields(
            { name: "Gerekli seçimler", value: "1. Anonim genel sohbet kanalı\n2. Onay kanalı\n3. Özel kanallar için kategori" },
            { name: "Bot izinleri", value: "Kanal Yönet, Webhook Yönet, Mesajları Yönet ve Mesaj Gönder" },
          )],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`anon_setup_start:${m.guildId}:${m.author.id}`).setLabel("Kanal Seçerek Kur").setStyle(ButtonStyle.Primary),
        )],
      });
      return;
    }
    try {
      await setupAnonymousApprovalPanel(m.guild, approval.id, general.id, category?.id);
      await m.reply(`✅ Anonim sistem hazır!\n• Onay: <#${approval.id}>\n• Genel sohbet: <#${general.id}>\n• Özel kanallar: ${category ? `<#${category.id}> kategorisinde` : "kategorisiz"}`);
    } catch (err) {
      logger.error({ err }, "Anonim sistem kurulamadı");
      await m.reply("❌ Sistem kurulamadı. Botun kanal oluşturma, mesaj yönetimi ve izinleri yönetme yetkilerini kontrol et.");
    }
    return;
  }

  // v!anon #kanal veya v!anon kur #kanal
  const channel = m.mentions.channels.first();
  if (channel && channel.type === ChannelType.GuildText) {
    await setAnonymousChat(m.guildId, channel.id);
    await m.reply(`✅ Anonim genel sohbet ayarlandı: <#${channel.id}>`);
    return;
  }
  await m.reply(
    "🕵️ **Anonim Sohbet Komutları:**\n" +
    "`anon kur #onay #genel [#kategori]` — onay paneli ve sistemi kurar\n" +
    "`anon aç #kanal` — anonim sohbeti açar\n" +
    "`anon durum` — mevcut kanalı gösterir\n" +
    "`anon kapat` — anonim sohbeti kapatır\n" +
    "`anon sıralama` — anonim puan sıralamasını gösterir",
  );
}

async function pfxAnonPuanVer(m: Message, args: string[]): Promise<void> {
  if (!isOwner(m.author.id)) {
    await m.reply("❌ Bu komut yalnızca bot sahibine açıktır.");
    return;
  }
  const result = await grantAnonymousPoints(args[0]?.replace(/^#/, "") ?? "", Number(args[1]));
  await m.reply(result.message);
}

async function pfxSohbet(m: Message, args: string[]): Promise<void> {
  if (!m.guild) return;
  const action = args[0]?.toLowerCase();
  if (action === "durum" || action === "status") {
    const account = await getOwnAnonymousProfile(m.guild.id, m.author.id);
    if (!account || account.privateChannelId !== m.channelId) {
      await m.reply("❌ Bu komut yalnızca kendi anonim özel kanalında kullanılabilir.");
      return;
    }
    await m.reply("🟢 Anonim özel sohbet komutu aktif. Kapatmak için `v!özel kapat` yazabilirsin.");
    return;
  }
  if (action === "kapat" || action === "bitir" || action === "stop") {
    const account = await getOwnAnonymousProfile(m.guild.id, m.author.id);
    if (!account || account.privateChannelId !== m.channelId) {
      await m.reply("❌ Bu komut yalnızca kendi anonim özel kanalında kullanılabilir.");
      return;
    }
    await m.reply("⏳ Anonim özel sohbet kapatılıyor...");
    const closed = await closeAnonymousChannelConversation(m.guild, m.author.id);
    if (!closed) {
      await m.channel.send("ℹ️ Aktif bir anonim özel sohbetin yok.").catch(() => null);
    }
    return;
  }
  const targetId = action === "et" || action === "baslat" || action === "başlat" ? args[1] : args[0];
  if (!targetId) {
    await m.reply("❌ Kullanım: `v!özel #ANONİM-ID`");
    return;
  }
  const result = await requestAnonymousConversation(m.guild, m.author.id, m.channelId, targetId);
  await m.reply({ content: `${result.ok ? "✅" : "❌"} ${result.message}` });
}

// ── ÇEKİLİŞ ──────────────────────────────────────────────────────────────────

async function pfxCekilis(m: Message, args: string[]): Promise<void> {
  if (!m.guildId || !m.guild) return;
  const sub = args[0]?.toLowerCase();

  // ── v!çekiliş başlat <süre> <ödül...> ────────────────────────────────────
  if (sub === "başlat" || sub === "baslat" || sub === "start") {
    if (!isOwner(m.author.id) && !m.member?.permissions.has("ManageGuild")) {
      await m.reply("❌ Çekiliş başlatmak için **Sunucuyu Yönet** yetkisine ihtiyacın var."); return;
    }
    const durationStr = args[1];
    if (!durationStr) { await m.reply("❌ Kullanım: `çekiliş başlat <süre> <ödül>`\nÖrn: `çekiliş başlat 1sa PlayStation 5`"); return; }
    const ms = parseDuration(durationStr);
    if (!ms || ms < 30_000 || ms > 30 * 24 * 60 * 60 * 1000) {
      await m.reply("❌ Geçersiz süre. Min: 30sn, Maks: 30g. Örn: `10m`, `1sa`, `2g`"); return;
    }
    const prize = args.slice(2).join(" ").trim();
    if (!prize) { await m.reply("❌ Ödül belirtmelisin. Örn: `çekiliş başlat 1sa PlayStation 5`"); return; }

    const endsAt = new Date(Date.now() + ms);
    const giveaway = await createGiveaway({ guildId: m.guildId, channelId: m.channelId, hostId: m.author.id, prize, endsAt });

    const buf = await generateGiveawayCard({ prize, hostName: m.author.displayName, participantCount: 0, endsAt, active: true });
    const sent = await m.channel.send({ files: [new AttachmentBuilder(buf, { name: "cekilis.png" })] });
    await setMessageId(giveaway.id, sent.id);

    // Güncellenen giveaway'i oluştur
    const updatedGw = { ...giveaway, messageId: sent.id };
    startGiveawayTimers(updatedGw, m.client, m.author.displayName);

    await m.reply(`✅ Çekiliş **#${giveaway.id}** başlatıldı! Katılmak için: \`çekiliş katıl\``);
    return;
  }

  // ── v!çekiliş katıl ───────────────────────────────────────────────────────
  if (sub === "katıl" || sub === "katil" || sub === "join") {
    const gw = await getChannelGiveaway(m.channelId);
    if (!gw) { await m.reply("❌ Bu kanalda aktif bir çekiliş yok."); return; }
    if (m.author.id === gw.hostId) { await m.reply("❌ Kendi çekilişine katılamazsın!"); return; }

    const result = await addParticipant(gw.id, m.author.id);
    if (!result.joined) {
      await m.reply(`⚠️ **${m.author.displayName}**, zaten bu çekilişe katıldın! (${result.count} katılımcı)`);
    } else {
      await m.reply(`🎉 **${m.author.displayName}** çekilişe katıldı! Toplam katılımcı: **${result.count}**`);
    }
    return;
  }

  // ── v!çekiliş bitir [ID] ──────────────────────────────────────────────────
  if (sub === "bitir" || sub === "end" || sub === "finish") {
    if (!isOwner(m.author.id) && !m.member?.permissions.has("ManageGuild")) {
      await m.reply("❌ Çekilişi bitirmek için **Sunucuyu Yönet** yetkisine ihtiyacın var."); return;
    }
    let gw = args[1] ? await getChannelGiveaway(m.channelId) : await getChannelGiveaway(m.channelId);
    if (!gw) { await m.reply("❌ Bu kanalda aktif bir çekiliş yok."); return; }

    await m.reply(`⏳ Çekiliş **#${gw.id}** sonlandırılıyor...`);
    const { winnerName } = await endGiveaway(gw.id, m.client);
    if (!winnerName) { await m.channel.send(`😔 Çekiliş bitti ama katılımcı yoktu.`); }
    return;
  }

  // ── v!çekiliş iptal [ID] ──────────────────────────────────────────────────
  if (sub === "iptal" || sub === "cancel") {
    if (!isOwner(m.author.id) && !m.member?.permissions.has("ManageGuild")) {
      await m.reply("❌ Çekilişi iptal etmek için **Sunucuyu Yönet** yetkisine ihtiyacın var."); return;
    }
    const gw = await getChannelGiveaway(m.channelId);
    if (!gw) { await m.reply("❌ Bu kanalda aktif bir çekiliş yok."); return; }

    await cancelGiveaway(gw.id);
    // Mesajı güncelle
    if (gw.messageId) {
      try {
        const msg = await m.channel.messages.fetch(gw.messageId);
        const participants: string[] = JSON.parse(gw.participants);
        const hostUser = await m.client.users.fetch(gw.hostId).catch(() => null);
        const buf = await generateGiveawayCard({
          prize: gw.prize, hostName: hostUser?.displayName ?? "?",
          participantCount: participants.length, endsAt: gw.endsAt, active: false,
        });
        await msg.edit({ files: [new AttachmentBuilder(buf, { name: "cekilis.png" })] });
      } catch { /**/ }
    }
    await m.reply(`❌ Çekiliş **#${gw.id}** (${gw.prize}) iptal edildi.`);
    return;
  }

  // ── v!çekiliş liste ───────────────────────────────────────────────────────
  if (sub === "liste" || sub === "list") {
    const list = await getActiveGiveaways(m.guildId);
    if (!list.length) { await m.reply("📋 Şu an bu sunucuda aktif çekiliş yok."); return; }
    const lines = list.map((gw) => {
      const participants: string[] = JSON.parse(gw.participants);
      const remaining = Math.max(0, Math.ceil((gw.endsAt.getTime() - Date.now()) / 1000));
      const h = Math.floor(remaining / 3600); const mn = Math.floor((remaining % 3600) / 60);
      const timeStr = remaining === 0 ? "Bitiyor" : (h > 0 ? `${h}sa ${mn}dk` : `${mn}dk`);
      return `**#${gw.id}** 🎁 **${gw.prize}** — ${participants.length} katılımcı — ${timeStr} kaldı`;
    });
    await m.reply(`🎁 **Aktif Çekilişler (${list.length}):**\n${lines.join("\n")}`);
    return;
  }

  // ── v!çekiliş tekrar <ID> ─────────────────────────────────────────────────
  if (sub === "tekrar" || sub === "reroll") {
    if (!isOwner(m.author.id) && !m.member?.permissions.has("ManageGuild")) {
      await m.reply("❌ Bu komutu kullanmak için **Sunucuyu Yönet** yetkisine ihtiyacın var."); return;
    }
    await m.reply("❌ Tekrar çekim için önce çekilişi bitir (`çekiliş bitir`) sonra tekrar yazabilirsin.");
    return;
  }

  // ── Yardım ───────────────────────────────────────────────────────────────
  await m.reply(
    "🎁 **Çekiliş Komutları:**\n" +
    "`çekiliş başlat <süre> <ödül>` — Yeni çekiliş başlat (30sn–30g)\n" +
    "`çekiliş katıl` — Bu kanaldaki çekilişe katıl\n" +
    "`çekiliş bitir` — Çekilişi şimdi bitir (Yönetici)\n" +
    "`çekiliş iptal` — Çekilişi iptal et (Yönetici)\n" +
    "`çekiliş liste` — Sunucudaki aktif çekilişleri listele\n\n" +
    "**Süre formatı:** `30sn`, `10m`, `1sa`, `2g`"
  );
}

// ── LEVEL TOGGLE ──────────────────────────────────────────────────────────────

async function pfxLevelToggle(m: Message, args: string[]): Promise<void> {
  if (!m.guildId || !m.member) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has("Administrator")) {
    await m.reply("❌ Bu komutu kullanmak için **Administrator** yetkisine ihtiyacın var."); return;
  }

  const sub = args[0]?.toLowerCase();

  if (!sub || sub === "durum" || sub === "status") {
    const enabled = await getLevelEnabled(m.guildId);
    await m.reply(
      `⭐ **Level Sistemi Durumu:** ${enabled ? "🟢 Açık" : "🔴 Kapalı"}\n` +
      `Değiştirmek için: \`level aç\` veya \`level kapat\``
    );
    return;
  }

  if (sub === "aç" || sub === "ac" || sub === "on" || sub === "enable") {
    await setLevelEnabled(m.guildId, true);
    await m.reply("🟢 **Level sistemi açıldı!** Artık mesaj atıldıkça XP kazanılacak.");
    return;
  }

  if (sub === "kapat" || sub === "off" || sub === "disable") {
    await setLevelEnabled(m.guildId, false);
    await m.reply("🔴 **Level sistemi kapatıldı.** Artık XP kazanılmayacak.");
    return;
  }

  await m.reply("❌ Kullanım: `level aç` / `level kapat` / `level durum`");
}

// ── Prefix handler tablosu ────────────────────────────────────────────────────

const prefixHandlers: Record<string, PfxHandler> = {
  // Level / Profil / Toggle
  level: (m, a) => a[0] && ["aç","ac","kapat","off","on","enable","disable","durum","status"].includes(a[0].toLowerCase()) ? pfxLevelToggle(m, a) : pfxLevel(m),
  lvl: (m) => pfxLevel(m), rank: (m) => pfxLevel(m), xp: (m) => pfxLevel(m),
  profil: (m) => pfxLevel(m), profile: (m) => pfxLevel(m),
  levelsistemi: pfxLevelToggle, leveltoggle: pfxLevelToggle,
  // Leaderboard
  leaderboard: (m) => pfxLeaderboard(m), lb: (m) => pfxLeaderboard(m), top: (m) => pfxLeaderboard(m),
  // Level rol
  levelrol: pfxLevelRol,
  tagrol: pfxTagRol,
  etiketrol: pfxTagRol,
  // Sicil
  sicil: (m) => pfxSicil(m),
  // Moderasyon
  ban: pfxBan,
  idban: pfxIdBan, banid: pfxIdBan,
  kick: pfxKick,
  rolover: pfxGiveRole, rolver: pfxGiveRole, giverole: pfxGiveRole,
  warn: pfxWarn,
  timeout: pfxTimeout, sustur: pfxTimeout,
  untimeout: pfxUntimeout, unsustur: pfxUntimeout,
  unban: pfxUnban, yasakkaldır: pfxUnban,
  uyarikaldir: pfxUyariKaldir,
  kilitle: (m) => pfxKilitle(m),
  ac: (m) => pfxAc(m), aç: (m) => pfxAc(m),
  temizle: pfxTemizle, clear: pfxTemizle,
  nuke: (m) => pfxNuke(m),
  // Ekonomi
  bakiye: (m) => pfxBakiye(m), balance: (m) => pfxBakiye(m),
  gunlukodul: (m) => pfxGunlukodul(m), daily: (m) => pfxGunlukodul(m),
  transfer: pfxTransfer,
  kumar: pfxKumar, slot: pfxKumar,
  rulet: pfxRulet, roulette: pfxRulet,
  coinflip: pfxCoinflip, cf: pfxCoinflip,
  blackjack: pfxBlackjack, bj: pfxBlackjack,
  duel: pfxDuel,
  pray: (m) => pfxPray(m), dua: (m) => pfxPray(m),
  // Ekonomi Seviye
  ekono: (m) => pfxEkono(m), ekonomi: (m) => pfxEkono(m), econlevel: (m) => pfxEkono(m), elevel: (m) => pfxEkono(m),
  ekonlider: (m) => pfxEkonLider(m), elb: (m) => pfxEkonLider(m), econlb: (m) => pfxEkonLider(m),
  // AI sohbet yönetimi
  aitemizle: async (m) => {
    clearChannelHistory(m.channelId);
    await m.reply("🧹 Bu kanalın AI sohbet geçmişi sıfırlandı!");
  },
  aigeçmiş: async (m) => {
    const size = getHistorySize(m.channelId);
    await m.reply(`🤖 Bu kanalda **${size}** mesaj geçmişi var.`);
  },

  // Bakım modu (sadece bot sahibi)
  bakım: async (m, args) => {
    if (!m.guildId) return;

    // Herkes listeyi görebilir
    const sub = args[0]?.toLowerCase();
    if (!sub || sub === "liste" || sub === "list") {
      await m.channel.sendTyping().catch(() => null);
      const entries = getMaintenanceList();
      let ownerName = "Bot Sahibi";
      try {
        const ownerId = getBotOwner();
        if (ownerId) {
          const u = await m.client.users.fetch(ownerId);
          ownerName = u.displayName;
        }
      } catch { /**/ }
      const buf = await generateMaintenanceCard({ entries, ownerName });
      await m.reply({ files: [new AttachmentBuilder(buf, { name: "bakim.png" })] });
      return;
    }

    // Geri kalan komutlar sadece bot sahibine açık
    if (!isOwner(m.author.id)) {
      await m.reply("❌ Bu komutu sadece **bot sahibi** kullanabilir.");
      return;
    }

    if (sub === "kaldır" || sub === "kaldir" || sub === "aç" || sub === "ac") {
      const cmd = args[1]?.toLowerCase();
      if (!cmd) { await m.reply("❌ Kullanım: `bakım kaldır <komut>`"); return; }
      const removed = removeMaintenance(cmd);
      await m.reply(removed
        ? `✅ **\`${cmd}\`** bakımdan çıkarıldı, tekrar kullanılabilir.`
        : `⚠️ **\`${cmd}\`** zaten bakımda değildi.`
      );
      return;
    }

    if (sub === "hepsini" || sub === "hepsi" || sub === "temizle") {
      clearAllMaintenance();
      await m.reply("✅ Tüm bakım modları kaldırıldı!");
      return;
    }

    // v!bakım <komut> [sebep...]
    const cmd = sub;
    const reason = args.slice(1).join(" ") || "Bakım çalışması yapılıyor";
    addMaintenance(cmd, reason);
    await m.reply(
      `🔧 **\`${cmd}\`** bakıma alındı!\n` +
      `📝 Sebep: *${reason}*\n` +
      `Kaldırmak için: \`bakım kaldır ${cmd}\``
    );
  },
  bakim: async (m, args) => {
    // Türkçe karakter olmadan alias
    const handler = prefixHandlers["bakım"];
    if (handler) await handler(m, args);
  },

  // Oyunlar
  rps: pfxRps, tkm: pfxRps,
  mine: pfxMine, minesweeper: pfxMine, mayin: pfxMine,
  patla: (m) => pfxPatla(m),
  zar: pfxZar, dice: pfxZar,
  "8top": pfxTop8, top8: pfxTop8,
  // Müzik
  çal: pfxCal, cal: pfxCal, play: pfxCal,
  dur: (m) => pfxDur(m), pause: (m) => pfxDur(m),
  atla: (m) => pfxAtla(m), skip: (m) => pfxAtla(m),
  kuyruk: (m) => pfxKuyruk(m), queue: (m) => pfxKuyruk(m),
  durdur: (m) => pfxDurdur(m), stop: (m) => pfxDurdur(m), leave: (m) => pfxDurdur(m),
  şarkı: (m) => pfxSarki(m), sarki: (m) => pfxSarki(m), np: (m) => pfxSarki(m), nowplaying: (m) => pfxSarki(m),
  // Yönetim
  setprefix: pfxSetPrefix, prefix: pfxSetPrefix,
  sunucukur: (m) => pfxSunucuKur(m),
  sunucukopyala: pfxSunucuKopyala, skopyala: pfxSunucuKopyala,
  // Rol kopyalama
  rolkopya: pfxRolKopya, rolkopyala: pfxRolKopya, copyroles: pfxRolKopya,
  // Sunucu açıklama düzenleme
  sunucuaciklama: (m, a) => pfxSunucuAciklama(m, a),
  sunucuaçıklama: (m, a) => pfxSunucuAciklama(m, a),
  guilddesc: (m, a) => pfxSunucuAciklama(m, a),
  // Otorol
  otorol: pfxOtorol, autorol: pfxOtorol, autorole: pfxOtorol,
  // Emoji ekle
  emojiekle: pfxEmojiEkle, emojiadd: pfxEmojiEkle, addEmoji: pfxEmojiEkle,
  // Ses kanalı
  seskanal: (m, a) => pfxSesKanal(m, a), seskanalac: (m, a) => pfxSesKanal(m, a), voicechannel: (m, a) => pfxSesKanal(m, a), vc: (m, a) => pfxSesKanal(m, a),
  userinfo: (m) => pfxUserinfo(m), kullanicibilgi: (m) => pfxUserinfo(m), uinfo: (m) => pfxUserinfo(m),
  ping: (m) => pfxPing(m),
  yardim: pfxYardim, yardım: pfxYardim, help: pfxYardim,
  // Çekiliş
  "çekiliş": pfxCekilis, cekilis: pfxCekilis, giveaway: pfxCekilis, cekilish: pfxCekilis,
  // Guard
  guard: pfxGuard, koruma: pfxGuard,
  // Moderasyon ayarları
  modsetup: pfxModSetup, modayar: pfxModSetup, moderasyon: pfxModSetup,
  // Stat
  stat: pfxStat, istatistik: pfxStat, stats: pfxStat,
  // Anonim sohbet
  anon: pfxAnon, anonim: pfxAnon,
  anonpuan: async (m) => pfxAnon(m, ["sıralama"]),
  anonsiralama: async (m) => pfxAnon(m, ["sıralama"]),
  anonpuanver: pfxAnonPuanVer,
  sohbet: pfxSohbet, anonsohbet: pfxSohbet, özel: pfxSohbet, ozel: pfxSohbet,
  anonprofil: async (m) => pfxAnon(m, ["profil"]),
  // Kanal oluşturma
  kanalac: pfxKanalAc, kanaloluştur: pfxKanalAc, kanalyap: pfxKanalAc, createchannel: pfxKanalAc,
  // Kanala mesaj gönder
  mesajat: pfxMesajAt, duyuru: pfxMesajAt, announce: pfxMesajAt, say: pfxMesajAt,
  // Başka sunucuya mesaj gönder (sadece bot sahibi)
  sunucumesaj: pfxSunucuMesaj, smesaj: pfxSunucuMesaj, crossmsg: pfxSunucuMesaj,
  // Uzak moderasyon (sadece bot sahibi)
  uzakmod: pfxUzakMod, remotemed: pfxUzakMod, rmod: pfxUzakMod,
  // ── Medya paylaşım (v!paylaş) ────────────────────────────────────────────────
  "paylaş": async (m) => { await sendMediaRequest(m); },
  paylas:   async (m) => { await sendMediaRequest(m); },
  paylash:  async (m) => { await sendMediaRequest(m); },
  // eski alias — geriye uyumluluk
  videoistek: async (m) => { await sendMediaRequest(m); },

  // ── Medya paylaşım kurulum (v!videosetup) ────────────────────────────────────
  videosetup: async (m, args) => {
    if (!m.guildId || !m.guild) return;
    if (m.author.id !== m.guild.ownerId && !isOwner(m.author.id)) {
      await m.reply("❌ Bu komutu yalnızca sunucu sahibi kullanabilir.");
      return;
    }

    const sub  = args[0]?.toLowerCase() ?? "";
    const gid  = m.guildId;

    // durum / yardım
    if (!sub || sub === "durum" || sub === "bilgi") {
      const s = await getVideoSettings(gid);
      const roleList = s.approvalRoles.length > 0
        ? s.approvalRoles.map((r) => `<@&${r}>`).join(", ")
        : "_Ayarlanmamış (sadece Yöneticiler)_";
      const storedInvite = await getInviteUrl(gid).catch(() => null);
      await m.reply(
        `📋 **Medya Paylaşım Kurulumu**\n` +
        `> Mod kanalı: ${s.moderationChannelId ? `<#${s.moderationChannelId}>` : "_Ayarlanmamış_"}\n` +
        `> Onay rolleri: ${roleList}\n` +
        `> Watermark URL: ${storedInvite ? `**${storedInvite}**` : "_Ayarlanmamış (watermark eklenmez)_"}\n\n` +
        `> Paylaşan adı: ${s.showSharerName ? "✅ Açık" : "❌ Kapalı"}\n\n` +
        `**Alt komutlar:**\n` +
        `\`v!videosetup #kanal\` — Mod kanalı ayarla\n` +
        `\`v!videosetup kaldir\` — Mod kanalını kaldır\n` +
        `\`v!videosetup onayrol @rol\` — Onay rolü ekle\n` +
        `\`v!videosetup onayrolkaldir @rol\` — Onay rolünü kaldır\n` +
        `\`v!videosetup davetlink discord.gg/xxx\` — Paylaşılan medyalara watermark olarak eklenecek URL'yi ayarla\n` +
        `\`v!videosetup davetlinkkaldır\` — Watermark URL'sini kaldır\n` +
        `\`v!videosetup paylaşanadı aç|kapat\` — Paylaşanın düz adını gösterir/gizler`
      );
      return;
    }

    if (sub === "paylaşanadı" || sub === "paylasanadi" || sub === "paylasan") {
      const value = args[1]?.toLowerCase();
      if (!["aç", "ac", "on", "kapat", "kapa", "off"].includes(value ?? "")) {
        await m.reply("❌ Kullanım: `v!videosetup paylaşanadı aç` veya `v!videosetup paylaşanadı kapat`");
        return;
      }
      const enabled = ["aç", "ac", "on"].includes(value!);
      await setShowSharerName(gid, enabled);
      await m.reply(
        enabled
          ? "✅ Paylaşan adı açıldı. Onaylanan medyalarda etiket kullanılmadan **KullanıcıAdı tarafından paylaşıldı** yazacak."
          : "✅ Paylaşan adı kapatıldı. Onaylanan medyalarda paylaşan adı gösterilmeyecek."
      );
      return;
    }

    // davetlink ayarla
    if (sub === "davetlink") {
      const rawUrl = args[1] ?? "";
      if (!rawUrl) {
        await m.reply("❌ Kullanım: `v!videosetup davetlink discord.gg/xxxxxx`");
        return;
      }
      // Hem "discord.gg/xxx" hem "https://discord.gg/xxx" formatlarını kabul et
      const normalized = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
      await setInviteUrl(gid, normalized);
      await m.reply(
        `✅ Davet linki ayarlandı!\n` +
        `Bundan sonra onaylanan her video/fotoğrafın üstünde şu link görünecek:\n` +
        `**${normalized}**`
      );
      return;
    }

    // davetlinkkaldır
    if (sub === "davetlinkkaldır" || sub === "davetlinkkaldır" || sub === "davetlinkkaldir") {
      await setInviteUrl(gid, null);
      await m.reply("✅ Davet linki kaldırıldı. Artık otomatik oluşturulan link kullanılacak.");
      return;
    }

    // onayrol ekle
    if (sub === "onayrol") {
      const role = m.mentions.roles.first();
      if (!role) { await m.reply("❌ Kullanım: `v!videosetup onayrol @rol`"); return; }
      const updated = await addApprovalRole(gid, role.id);
      await m.reply(`✅ **@${role.name}** onay rollerine eklendi.\n📋 Güncel roller: ${updated.map((r) => `<@&${r}>`).join(", ")}`);
      return;
    }

    // onayrolkaldir
    if (sub === "onayrolkaldir" || sub === "onayrolkaldır") {
      const role = m.mentions.roles.first();
      if (!role) { await m.reply("❌ Kullanım: `v!videosetup onayrolkaldir @rol`"); return; }
      const updated = await removeApprovalRole(gid, role.id);
      await m.reply(
        `✅ **@${role.name}** onay rollerinden kaldırıldı.\n` +
        `📋 Güncel roller: ${updated.length > 0 ? updated.map((r) => `<@&${r}>`).join(", ") : "_Yok (sadece Yöneticiler)_"}`
      );
      return;
    }

    // kaldır
    if (sub === "kaldir" || sub === "kaldır") {
      await setVideoModerationChannel(gid, null);
      await m.reply("✅ Moderasyon kanalı kaldırıldı.");
      return;
    }

    // #kanal
    const ch = m.mentions.channels.first();
    if (!ch || !(ch instanceof TextChannel)) {
      await m.reply("❌ Kullanım: `v!videosetup #kanal`");
      return;
    }
    await setVideoModerationChannel(gid, ch.id);
    await m.reply(
      `✅ Moderasyon kanalı **#${ch.name}** olarak ayarlandı!\n` +
      `Üyeler \`v!paylaş #hedef-kanal açıklama\` komutuyla istek gönderebilir.\n` +
      `💡 Onay rolleri eklemek için: \`v!videosetup onayrol @rol\``
    );
  },

  // ── Kategori oluştur ──────────────────────────────────────────────────────────
  kategoriac:     pfxKategoriAc,
  kategorioluştur: pfxKategoriAc,
  kategoriyap:    pfxKategoriAc,
  kategoriolustur: pfxKategoriAc,
};

// ── Bot başlatma ──────────────────────────────────────────────────────────────

export async function startBot(): Promise<void> {
  const token    = process.env["DISCORD_TOKEN"];
  const clientId = process.env["DISCORD_CLIENT_ID"];
  if (!token)    { logger.warn("DISCORD_TOKEN eksik — bot başlamayacak."); return; }
  if (!clientId) { logger.warn("DISCORD_CLIENT_ID eksik — bot başlamayacak."); return; }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildPresences,
    ],
    // DM kanalları cache'de bulunmadığı için partial olarak alınmalı.
    partials: [Partials.Channel],
  });

  client.once(Events.ClientReady, async (c) => {
    await ensureAnonymousSchema().catch((err) => logger.error({ err }, "Anonim veritabanı şeması hazırlanamadı"));
    logger.info({ tag: c.user.tag }, "Discord botu hazır!");

    // Bot sahibini belirle (application owner)
    try {
      const app = await c.application!.fetch();
      const owner = app.owner;
      if (owner && "id" in owner) {
        setBotOwner(owner.id);
        logger.info({ ownerId: owner.id }, "Bot sahibi belirlendi");
      }
    } catch (err) {
      logger.warn({ err }, "Bot sahibi belirlenemedi");
    }

    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot+applications.commands`;
    logger.info({ inviteUrl }, "Davet URL:");

    // ── Vivincy coin uygulama emojisi ────────────────────────────────────────
    try {
      const emojiName = "vivincy_coin";
      const existingEmojis = await c.application!.emojis.fetch();
      let emoji = existingEmojis.find((e) => e.name === emojiName);
      if (!emoji) {
        const assetPath = join(dirname(fileURLToPath(import.meta.url)), "../assets/vivincy_coin.png");
        const attachment = readFileSync(assetPath);
        const base64 = `data:image/png;base64,${attachment.toString("base64")}`;
        emoji = await c.application!.emojis.create({ name: emojiName, attachment: base64 });
        logger.info({ id: emoji.id }, "Vivincy coin emojisi oluşturuldu");
      } else {
        logger.info({ id: emoji.id }, "Vivincy coin emojisi mevcut");
      }
      COIN = `<:${emojiName}:${emoji.id}>`;
    } catch (err) {
      logger.warn({ err }, "Vivincy coin emojisi yüklenemedi, fallback kullanılıyor");
    }

    // ── Bot durumu rotasyonu ──────────────────────────────────────────────────
    const updateStatus = () => {
      const guildCount = c.guilds.cache.size;
      const memberCount = c.guilds.cache.reduce((a, g) => a + (g.memberCount ?? 0), 0);
      const statuses = [
        { name: `${guildCount} sunucuda hizmet`, type: 3 as const },
        { name: `${memberCount.toLocaleString("en-US")} kullanıcıya`, type: 3 as const },
        { name: "v!yardim", type: 2 as const },
        { name: "West & Bartu & Santana", type: 3 as const },
      ];
      const idx = Math.floor(Date.now() / 30_000) % statuses.length;
      const s = statuses[idx]!;
      c.user.setPresence({ status: "online", activities: [{ name: s.name, type: s.type }] });
    };

    updateStatus();
    setInterval(updateStatus, 30_000);

    // ── Müzik sistemi ön ısınma (ilk çal komutunu hızlandırır) ───────────────
    warmupMusic().catch(() => null);

    // ── Aktif çekilişleri yeniden başlat ─────────────────────────────────────
    resumeActiveGiveaways(c).catch(() => null);

    // ── Sunucu etiketi → rol senkronizasyonu ─────────────────────────────────
    for (const guild of c.guilds.cache.values()) {
      syncGuildTagRoles(guild).catch((err) =>
        logger.warn({ err, guildId: guild.id }, "Etiket rolleri başlangıçta senkronize edilemedi"),
      );
    }

    // ── Bot otomatik yönetici rolü (tüm sunucular) ────────────────────────────
    for (const guild of c.guilds.cache.values()) {
      ensureBotAdminRole(guild).catch((err) =>
        logger.warn({ err, guildId: guild.id }, "Otomatik yönetici rolü atanamadı"),
      );
    }
  });

  // ── Bot yeni sunucuya katıldığında otomatik admin rolü ────────────────────
  client.on(Events.GuildCreate, async (guild) => {
    logger.info({ guildId: guild.id, guildName: guild.name }, "Yeni sunucuya katıldı");
    await ensureBotAdminRole(guild).catch((err) =>
      logger.warn({ err, guildId: guild.id }, "GuildCreate: otomatik admin rolü atanamadı"),
    );
  });

  // Kullanıcı sunucu etiketini etkinleştirdiğinde/kaldırdığında tetiklenir.
  client.on(Events.UserUpdate, async (oldUser, newUser) => {
    if (oldUser.primaryGuild?.tag === newUser.primaryGuild?.tag &&
        oldUser.primaryGuild?.identityEnabled === newUser.primaryGuild?.identityEnabled &&
        oldUser.primaryGuild?.identityGuildId === newUser.primaryGuild?.identityGuildId) {
      return;
    }

    for (const guild of client.guilds.cache.values()) {
      const member = guild.members.cache.get(newUser.id);
      if (member) await syncMemberTagRole(member).catch(() => null);
    }
  });

  // ── Ses XP ───────────────────────────────────────────────────────────────
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const userId  = newState.member?.id ?? oldState.member?.id;
    const guildId = newState.guild.id;
    if (!userId || newState.member?.user.bot) return;
    const key = `${userId}:${guildId}`;

    if (!oldState.channelId && newState.channelId) {
      voiceSessions.set(key, Date.now());
    } else if (oldState.channelId && !newState.channelId) {
      const start = voiceSessions.get(key);
      if (!start) return;
      voiceSessions.delete(key);
      const minutes = Math.floor((Date.now() - start) / 60_000);
      if (minutes < 1) return;
      const result = await handleXp(userId, guildId, newState.guild, minutes * VOICE_XP_PER_MIN).catch(() => null);
      if (result?.leveledUp) {
        const ch = newState.guild.systemChannel ?? oldState.channel;
        if (ch && "send" in ch) {
          try {
            const u = await client.users.fetch(userId);
            const buf = await generateLevelUpCard({
              username: u.displayName,
              avatarUrl: u.displayAvatarURL({ extension: "png", size: 256 }),
              oldLevel: result.oldLevel, newLevel: result.newLevel,
            });
            await (ch as TextChannel).send({ content: `${u}`, files: [new AttachmentBuilder(buf, { name: "levelup.png" })] });
          } catch { /**/ }
        }
      }
    }
  });

  // ── Button etkileşimleri ──────────────────────────────────────────────────
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChannelSelectMenu() && interaction.customId.startsWith("anon_setup_")) {
      const [kind, guildId, userId] = interaction.customId.split(":");
      if (!interaction.guildId || interaction.guildId !== guildId || interaction.user.id !== userId) {
        await interaction.reply({ content: "❌ Bu seçim paneli sana ait değil.", ephemeral: true }).catch(() => null);
        return;
      }
      const key = `${guildId}:${userId}`;
      const session = anonymousSetupSessions.get(key) ?? { guildId, userId };
      const selected = interaction.values[0];
      if (kind === "anon_setup_general") session.generalChannelId = selected;
      if (kind === "anon_setup_approval") session.approvalChannelId = selected;
      if (kind === "anon_setup_category") session.categoryId = selected;
      anonymousSetupSessions.set(key, session);

      const finishRow = session.generalChannelId && session.approvalChannelId && session.categoryId
        ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`anon_setup_finish:${guildId}:${userId}`).setLabel("✅ Kurulumu Tamamla").setStyle(ButtonStyle.Success),
        )]
        : [];
      await interaction.update({
        content:
          `Seçimler kaydedildi.\n` +
          `• Genel kanal: ${session.generalChannelId ? `<#${session.generalChannelId}>` : "Seçilmedi"}\n` +
          `• Onay kanalı: ${session.approvalChannelId ? `<#${session.approvalChannelId}>` : "Seçilmedi"}\n` +
          `• Özel kanal kategorisi: ${session.categoryId ? `<#${session.categoryId}>` : "Seçilmedi"}\n\n` +
          (finishRow.length ? "Her şey hazır. Kurulumu başlatmak için butona bas." : "Eksik seçimleri aşağıdaki menülerden tamamla."),
        components: [
          new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
            new ChannelSelectMenuBuilder().setCustomId(`anon_setup_general:${guildId}:${userId}`).setPlaceholder("Anonim genel sohbet kanalını seç").setChannelTypes(ChannelType.GuildText).setMaxValues(1),
          ),
          new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
            new ChannelSelectMenuBuilder().setCustomId(`anon_setup_approval:${guildId}:${userId}`).setPlaceholder("Onay kanalını seç").setChannelTypes(ChannelType.GuildText).setMaxValues(1),
          ),
          new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
            new ChannelSelectMenuBuilder().setCustomId(`anon_setup_category:${guildId}:${userId}`).setPlaceholder("Özel kanal kategorisini seç").setChannelTypes(ChannelType.GuildCategory).setMaxValues(1),
          ),
          ...finishRow,
        ],
      }).catch(() => null);
      return;
    }
    if (!interaction.isButton()) return;
    const { customId } = interaction;

    // Anonim profil onay/red butonları DM'den gelir.
    if (customId.startsWith("anon_setup_start:")) {
      const [, guildId, userId] = customId.split(":");
      if (userId !== interaction.user.id || interaction.guildId !== guildId) {
        await interaction.reply({ content: "❌ Bu panel sana ait değil.", ephemeral: true }).catch(() => null);
        return;
      }
      const key = `${guildId}:${userId}`;
      anonymousSetupSessions.set(key, { guildId: guildId!, userId: userId! });
      await interaction.reply({
        content: "Kurulum için üç seçimi de yap. Seçimlerden sonra **Kurulumu Tamamla** butonu görünecek.",
        ephemeral: true,
        components: [
          new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
            new ChannelSelectMenuBuilder().setCustomId(`anon_setup_general:${guildId}:${userId}`).setPlaceholder("Anonim genel sohbet kanalını seç").setChannelTypes(ChannelType.GuildText).setMaxValues(1),
          ),
          new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
            new ChannelSelectMenuBuilder().setCustomId(`anon_setup_approval:${guildId}:${userId}`).setPlaceholder("Onay kanalını seç").setChannelTypes(ChannelType.GuildText).setMaxValues(1),
          ),
          new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
            new ChannelSelectMenuBuilder().setCustomId(`anon_setup_category:${guildId}:${userId}`).setPlaceholder("Özel kanal kategorisini seç").setChannelTypes(ChannelType.GuildCategory).setMaxValues(1),
          ),
        ],
      }).catch(() => null);
      return;
    }
    if (customId.startsWith("anon_setup_finish:")) {
      const [, guildId, userId] = customId.split(":");
      if (userId !== interaction.user.id || interaction.guildId !== guildId) {
        await interaction.reply({ content: "❌ Bu panel sana ait değil.", ephemeral: true }).catch(() => null);
        return;
      }
      const session = anonymousSetupSessions.get(`${guildId}:${userId}`);
      if (!session?.generalChannelId || !session.approvalChannelId || !session.categoryId) {
        await interaction.reply({ content: "❌ Önce genel kanal, onay kanalı ve kategori seçimlerini tamamla.", ephemeral: true }).catch(() => null);
        return;
      }
      await interaction.deferUpdate();
      try {
        await setupAnonymousApprovalPanel(interaction.guild!, session.approvalChannelId, session.generalChannelId, session.categoryId);
        anonymousSetupSessions.delete(`${guildId}:${userId}`);
        await interaction.editReply({
          content: `✅ Anonim sistem kuruldu!\n• Genel sohbet: <#${session.generalChannelId}>\n• Onay kanalı: <#${session.approvalChannelId}>\n• Özel kanal kategorisi: <#${session.categoryId}>`,
          components: [],
        });
      } catch (err) {
        logger.error({ err }, "Anonim butonlu kurulum başarısız");
        await interaction.editReply({ content: "❌ Kurulum başarısız. Botun kanal, webhook, mesaj ve izinleri yönetme yetkilerini kontrol et.", components: [] }).catch(() => null);
      }
      return;
    }
    if (customId.startsWith("anon_create_account:")) {
      const result = await handleAnonymousButton(customId, interaction.user.id, client).catch((err) => {
        logger.error({ err }, "Anonim hesap butonu hatası");
        return { handled: true, content: "❌ İşlem sırasında hata oluştu." };
      });
      const guildId = customId.split(":")[1];
      const components = [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`anon_confirm_account:${guildId}:${interaction.user.id}`).setLabel("Kuralları Kabul Et ve Oluştur").setStyle(ButtonStyle.Success),
      )];
      await interaction.reply({ content: result.content ?? "İşlem tamamlandı.", components, ephemeral: true }).catch(() => null);
      return;
    }
    if (customId.startsWith("anon_confirm_account:")) {
      const result = await handleAnonymousButton(customId, interaction.user.id, client).catch((err) => {
        logger.error({ err }, "Anonim hesap onay butonu hatası");
        return { handled: true, content: "❌ Hesap oluşturulamadı." };
      });
      const components = result.accountId
        ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`anon_join:${result.accountId}:${interaction.user.id}`).setLabel("Sohbete Katıl").setStyle(ButtonStyle.Success),
        )] : [];
      await interaction.update({ content: result.content ?? "İşlem tamamlandı.", components }).catch(() => null);
      return;
    }
    if (customId.startsWith("anon_join:")) {
      const result = await handleAnonymousButton(customId, interaction.user.id, client).catch((err) => {
        logger.error({ err }, "Anonim kanal butonu hatası");
        return { handled: true, content: "❌ Özel kanal oluşturulamadı." };
      });
      await interaction.reply({ content: result.content ?? "İşlem tamamlandı.", ephemeral: true }).catch(() => null);
      return;
    }
    if (customId.startsWith("anon_id_approve:") || customId.startsWith("anon_id_deny:")) {
      const [action, requestId, buttonUserId] = customId.split(":");
      if (buttonUserId !== interaction.user.id) {
        await interaction.reply({ content: "❌ Bu buton sana ait değil.", ephemeral: true }).catch(() => null);
        return;
      }
      const result = await resolveAnonymousIdChange(
        requestId!,
        interaction.user.id,
        action === "anon_id_approve",
      ).catch((err) => {
        logger.error({ err }, "Anonim ID butonu hatası");
        return { ok: false, message: "İşlem sırasında hata oluştu." };
      });
      await interaction.update({
        embeds: [new EmbedBuilder()
          .setColor(result.ok ? (action === "anon_id_approve" ? 0x57f287 : 0x72767d) : 0xed4245)
          .setTitle(action === "anon_id_approve" ? "✅ Anonim ID Onaylandı" : action === "anon_id_deny" ? "❌ Anonim ID Reddedildi" : "⚠️ Anonim ID İşlemi")
          .setDescription(result.message)
          .setTimestamp()],
        components: [],
      }).catch(() => null);
      return;
    }
    if (customId.startsWith("anon_chat_approve:") || customId.startsWith("anon_chat_reject:")) {
      const [action, requestId, buttonUserId] = customId.split(":");
      if (buttonUserId !== interaction.user.id || !interaction.guild) {
        await interaction.reply({ content: "❌ Bu buton sana ait değil.", ephemeral: true }).catch(() => null);
        return;
      }
      await interaction.deferUpdate().catch(() => null);
      const result = await resolveAnonymousConversation(
        interaction.guild,
        requestId!,
        interaction.user.id,
        action === "anon_chat_approve",
      ).catch((err) => {
        logger.error({ err }, "Anonim sohbet butonu hatası");
        return { ok: false, message: "İşlem sırasında hata oluştu." };
      });
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(result.ok ? (action === "anon_chat_approve" ? 0x57f287 : 0x72767d) : 0xed4245)
          .setTitle(action === "anon_chat_approve" ? "✅ Anonim sohbet onaylandı" : action === "anon_chat_reject" ? "❌ Anonim sohbet reddedildi" : "⚠️ Anonim sohbet işlemi")
          .setDescription(result.message)
          .setTimestamp()],
        components: [],
      }).catch(() => null);
      return;
    }
    if (customId.startsWith("anon_approve:") || customId.startsWith("anon_deny:")) {
      const result = await handleAnonymousButton(customId, interaction.user.id, client).catch((err) => {
        logger.error({ err }, "Anonim profil butonu hatası");
        return { handled: true, content: "❌ İşlem sırasında hata oluştu." };
      });
      await interaction.update({ content: result.content ?? "İşlem tamamlandı.", components: [] }).catch(() => null);
      return;
    }

    // Moderasyon onay butonları
    if (customId.startsWith("modapprove_") || customId.startsWith("modreject_")) {
      await handleApprovalButton(interaction).catch((err) =>
        logger.error({ err }, "Mod onay butonu hatası")
      );
      return;
    }

    // Video istek onay/red butonları
    if (customId.startsWith("videoapprove_") || customId.startsWith("videoreject_")) {
      await handleVideoApprovalButton(interaction).catch((err) =>
        logger.error({ err }, "Video onay butonu hatası")
      );
      return;
    }

    // Mine (mayın tarlası) butonları
    if (customId.startsWith("mine_")) {
      await handleMineClick(interaction, COIN).catch((err) =>
        logger.error({ err }, "Mine tıklama hatası")
      );
      return;
    }

    if (!customId.startsWith("help_")) return;

    const prefix = interaction.guildId
      ? await getPrefix(interaction.guildId).catch(() => "v!")
      : "v!";

    if (customId === "help_overview") {
      await interaction.update({
        embeds: [buildHelpOverviewEmbed(prefix)],
        components: buildHelpButtons(),
      });
      return;
    }

    const catKey = customId.replace("help_cat_", "");
    const embed = buildHelpCategoryEmbed(prefix, catKey);
    if (!embed) {
      await interaction.update({ content: "❌ Kategori bulunamadı.", components: [] });
      return;
    }

    const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("help_overview")
        .setLabel("◀ Tüm Kategoriler")
        .setStyle(ButtonStyle.Primary)
    );
    await interaction.update({
      embeds: [embed],
      components: [backRow],
    });
  });

  // ── Guard: Bot katılım koruması ───────────────────────────────────────────
  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    await handleBotJoin(member).catch(() => null);
    await syncMemberTagRole(member).catch(() => null);
    await applyAutoRoles(member).catch(() => null);
  });

  client.on(Events.GuildMemberUpdate, async (_oldMember, newMember) => {
    await syncMemberTagRole(newMember).catch(() => null);
  });

  // ── Guard: Rol & Kanal saldırısı tespiti ─────────────────────────────────
  client.on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
    if (
      entry.action === AuditLogEvent.MemberRoleUpdate ||
      entry.action === AuditLogEvent.RoleCreate ||
      entry.action === AuditLogEvent.RoleDelete ||
      entry.action === AuditLogEvent.RoleUpdate
    ) {
      await handleRoleUpdate(guild, entry).catch(() => null);
    }
    if (
      entry.action === AuditLogEvent.ChannelCreate ||
      entry.action === AuditLogEvent.ChannelDelete ||
      entry.action === AuditLogEvent.ChannelUpdate
    ) {
      await handleChannelChange(guild, entry).catch(() => null);
    }
  });

  // ── Mesaj XP + Guard + Prefix komutlar ───────────────────────────────────
  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot) return;

    // DM: anonim profil, anonim hesaba mesaj ve kara liste işlemleri.
    if (!message.guildId) {
      logger.info({ userId: message.author.id, messageId: message.id }, "Anonim DM alındı");
      const dmArgs = message.content.trim().split(/\s+/);
      const dmCmd = dmArgs.shift()?.toLowerCase();
      const normalizedDmCmd = dmCmd?.replace(/[()]/g, "");

      // v!konuşmabaşlat (anonim-hesap-id)
      if (
        normalizedDmCmd === "v!konuşmabaşlat" ||
        normalizedDmCmd === "v!konusmabaslat" ||
        (normalizedDmCmd === "v!konuşma" && ["başlat", "baslat", "start"].includes(dmArgs[0]?.toLowerCase() ?? ""))
      ) {
        const targetAccountId = (
          normalizedDmCmd === "v!konuşma" ? dmArgs[1] : dmArgs[0]
        )?.replace(/[()<>]/g, "");
        if (!targetAccountId) {
          await message.author.send(
            "Kullanım: `v!konuşmabaşlat (anonim-hesap-id)`",
          ).catch(() => null);
        } else {
          const result = await startAnonymousConversation(message.author.id, targetAccountId, client);
          await message.author.send(`${result.ok ? "✅" : "❌"} ${result.message}`).catch(() => null);
        }
        return;
      }

      if (
        normalizedDmCmd === "v!konuşmakapat" ||
        normalizedDmCmd === "v!konusmakapat" ||
        (normalizedDmCmd === "v!konuşma" && ["kapat", "bitir", "stop"].includes(dmArgs[0]?.toLowerCase() ?? ""))
      ) {
        const stopped = await stopAnonymousConversation(message.author.id);
        await message.author.send(
          stopped ? "✅ Anonim sohbet kapatıldı." : "ℹ️ Aktif bir anonim sohbetin yok.",
        ).catch(() => null);
        return;
      }

      if (dmCmd === "v!anon" || dmCmd === "v!anonim") {
        const sub = dmArgs[0]?.toLowerCase();
        if (sub === "profil" || sub === "profile" || sub === "bilgi") {
          const profileSub = dmArgs[1]?.toLowerCase();
          if (profileSub === "düzenle" || profileSub === "duzenle" || profileSub === "edit") {
            const accountId = dmArgs[2];
            const displayName = dmArgs.slice(3).join(" ");
            if (!accountId || !displayName) {
              await message.author.send("Kullanım: `v!anon profil düzenle <hesap-id> <yeni-ad>`").catch(() => null);
            } else {
              const result = await updateAnonymousProfile(message.author.id, accountId, displayName);
              await message.author.send(`${result.ok ? "✅" : "❌"} ${result.message}`).catch(() => null);
            }
          } else {
            await sendAnonymousProfileDm(message.author.id, client);
          }
        } else if (sub === "id" || sub === "kimlik") {
          const requestedId = dmArgs[1];
          if (!requestedId) {
            await message.author.send(
              "Kullanım: `v!anon id <yeni-id>`\n" +
              "ID tam olarak 5 rakam olmalı. Örnek: `01234`. Değişiklik ücreti: **50 puan**.",
            ).catch(() => null);
          } else {
            const result = await requestAnonymousIdChange(message.author.id, requestedId);
            if (!result.ok || !result.requestId) {
              await message.author.send(`❌ ${result.message}`).catch(() => null);
            } else {
              const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId(`anon_id_approve:${result.requestId}:${message.author.id}`)
                  .setLabel("✅ Onayla (50 puan)")
                  .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                  .setCustomId(`anon_id_deny:${result.requestId}:${message.author.id}`)
                  .setLabel("❌ Reddet")
                  .setStyle(ButtonStyle.Danger),
              );
              await message.author.send({
                embeds: [new EmbedBuilder()
                  .setColor(0xffc857)
                  .setTitle("🕵️ Anonim ID Değişikliği")
                  .setDescription(
                    `Yeni anonim ID'n **${requestedId.toUpperCase()}** olarak ayarlanacak.\n\n` +
                    "Bu ID tüm anonim hesaplar arasında benzersiz olmalıdır. Onaylarsan **50 puan** düşülür; reddedersen puanın harcanmaz.",
                  )
                  .addFields(
                    { name: "Yeni ID", value: `\`${requestedId.toUpperCase()}\``, inline: true },
                    { name: "Ücret", value: "⭐ 50 puan", inline: true },
                  )
                  .setFooter({ text: "Bu istek 10 dakika içinde geçerliliğini yitirir." })
                  .setTimestamp()],
                components: [row],
              }).catch(() => null);
            }
          }
        } else if (sub === "sıralama" || sub === "siralama" || sub === "lider" || sub === "puan") {
          const rows = await getAnonymousPointLeaderboard(10);
          const embed = new EmbedBuilder()
            .setColor(0xffc857)
            .setTitle("🕵️ Anonim Puan Sıralaması")
            .setDescription(rows.length
              ? rows.map((row, i) => `${i + 1}. **${row.anonymousId ?? row.displayName}** — ⭐ **${row.points} puan**`).join("\n")
              : "Henüz anonim mesaj gönderen yok.")
            .setFooter({ text: "Anonim özel kanalından gönderilen her mesaj 1 puan kazandırır." })
            .setTimestamp();
          await message.author.send({ embeds: [embed] }).catch(() => null);
        } else if (sub === "mesaj" || sub === "dm" || sub === "gönder" || sub === "gonder") {
          const accountId = dmArgs[1];
          const content = dmArgs.slice(2).join(" ").trim();
          if (!accountId || !content) {
            await message.author.send(
              "Kullanım: `v!anon mesaj <anonim-hesap-id> <mesaj>`\n" +
              "Örnek: `v!anon mesaj 123456789-987654321 Merhaba!`",
            ).catch(() => null);
          } else {
            const result = await sendAnonymousMessage(message.author.id, accountId, content, client);
            await message.author.send(`${result.ok ? "✅" : "❌"} ${result.message}`).catch(() => null);
          }
        } else if (sub === "karaliste" || sub === "kara" || sub === "blacklist") {
          const action = dmArgs[1]?.toLowerCase();
          const accountId = dmArgs[2];
          if (action === "liste" || action === "list") {
            const blocked = await getBlockedAnonymousAccounts(message.author.id);
            await message.author.send(
              blocked.length
                ? `🚫 **Anonim kara listen:**\n${blocked.map(b => `• \`${b.accountId}\` — **${b.displayName ?? "Silinmiş hesap"}**`).join("\n")}`
                : "✅ Anonim kara listen boş.",
            ).catch(() => null);
          } else if (action === "ekle" || action === "add" || action === "kaldır" || action === "kaldir" || action === "remove") {
            if (!accountId) {
              await message.author.send("Kullanım: `v!anon karaliste ekle/kaldir <anonim-hesap-id>`").catch(() => null);
            } else {
              const result = action === "ekle" || action === "add"
                ? await blockAnonymousAccount(message.author.id, accountId)
                : await unblockAnonymousAccount(message.author.id, accountId);
              await message.author.send(`${result.ok ? "✅" : "❌"} ${result.message}`).catch(() => null);
            }
          } else {
            await message.author.send(
              "Kullanım: `v!anon karaliste liste`\n" +
              "`v!anon karaliste ekle <id>`\n" +
              "`v!anon karaliste kaldir <id>`",
            ).catch(() => null);
          }
        } else {
          await message.author.send(
            "🕵️ **Anonim DM kullanımı**\n" +
            "`v!anon profil` — Hesap ID'lerini ve profillerini gösterir\n" +
            "`v!anon profil düzenle <id> <ad>` — Profil adını değiştirir\n" +
            "`v!anon id <5-rakam>` — Anonim #00000 ID'ni 50 puan karşılığında değiştirir\n" +
            "`v!anon mesaj <id> <mesaj>` — Anonim hesaba DM gönderir\n" +
            "`v!anon sıralama` — Anonim puan sıralamasını gösterir\n" +
            "`v!anon karaliste liste` — Engellediklerini gösterir\n" +
            "`v!anon karaliste ekle <id>` — Bu hesaptan mesaj alma\n" +
            "`v!anon karaliste kaldir <id>` — Engeli kaldırır",
          ).catch(() => null);
        }
      } else {
        // Aktif anonim sohbet varsa bu DM mesajını karşı tarafa aktar.
        await relayAnonymousConversationMessage(message, client).catch((err) => {
          logger.error({ err, userId: message.author.id }, "Anonim DM aktarım hatası");
        });
      }
      return;
    }

    // ── Bot etiketlendiğinde AI sohbet ──────────────────────────────────────
    const botId = client.user?.id;
    const isMentioned =
      botId &&
      (message.content.includes(`<@${botId}>`) || message.content.includes(`<@!${botId}>`));

    // ── VBRİ code kanalı — sadece bot/sunucu sahibi ────────────────────────
    const chName = "name" in message.channel
      ? (message.channel as { name?: string }).name?.toLowerCase() ?? ""
      : "";
    const isCodeCh =
      (chName.includes("vbri") || chName.includes("vbr")) &&
      (chName.includes("code") || chName.includes("kod"));
    if (isCodeCh && (isOwner(message.author.id) || message.guild?.ownerId === message.author.id)) {
      await handleCodeChannel(message).catch((err) =>
        logger.error({ err }, "VBRIaimotor kod kanalı hatası")
      );
      return;
    }

    if (isMentioned) {
      await handleAiMessage(message).catch((err) =>
        logger.error({ err }, "VBRIaimotor sohbet hatası")
      );
      return; // Guard ve XP'yi atla — sadece AI yanıtı ver
    }

    const prefix = await getPrefix(message.guildId).catch(() => "v!");

    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).trim().split(/\s+/);
      const cmd = args.shift()?.toLowerCase() ?? "";
      let handler = prefixHandlers[cmd];
      let resolvedCmd = cmd;

      // Komut bulunamadıysa akıllı eşleştirme dene
      if (!handler && cmd.length >= 2) {
        const match = await resolveCommand(cmd).catch(() => null);
        if (match && prefixHandlers[match.cmd]) {
          handler = prefixHandlers[match.cmd]!;
          resolvedCmd = match.cmd;

          // Kullanıcıya sessizce bildir (1 saniye sonra silinir)
          const hint = await message.reply(
            `💡 **\`${prefix}${cmd}\`** → **\`${prefix}${resolvedCmd}\`** olarak anladım!`
          ).catch(() => null);
          if (hint) setTimeout(() => hint.delete().catch(() => null), 5000);
        }
      }

      if (handler) {
        // Bakım modu kontrolü — bakımdaki komutlar bot sahibi dahil hiç kimseye açık değildir.
        // Bakım komutunun kendisi açık kalır ki sahip bakım modunu kaldırabilsin.
        const bypassCmds = new Set(["bakım", "bakim", "bakimmod", "aimod", "aitemizle", "aigeçmiş"]);
        if (isInMaintenance(resolvedCmd) && !bypassCmds.has(resolvedCmd)) {
          await message.reply(
            `🔧 **\`${prefix}${resolvedCmd}\`** şu an bakımda, birazdan geri dönecek!\n` +
            `Bakım listesi için: \`${prefix}bakım liste\``
          );
          return;
        }
        await handler(message, args).catch(async (err) => {
          logger.error({ err, cmd: resolvedCmd }, "Prefix hata");
          await message.reply(`❌ **\`${prefix}${resolvedCmd}\`** çalıştırılırken hata oluştu: ${(err as any)?.message ?? "Bilinmeyen hata"}`).catch(() => null);
        });
        return;
      }
    }

    // Anonim özel sohbet aktarımı, genel anonim kanal işleyicisinden önce gelir.
    // Özel sohbet kanallarındaki mesajlar genel sohbete düşmemelidir.
    const anonymousChannelRelayed = await relayAnonymousChannelMessage(message).catch((err) => {
      logger.error({ err }, "Anonim özel kanal aktarım hatası");
      return false;
    });
    if (anonymousChannelRelayed) return;

    // Anonim kanal: komutlardan sonra, guard ve XP'den önce işlenir.
    // Böylece anonim kanaldaki normal mesajlar kullanıcı adı görünmeden gider.
    const anonymousHandled = await handleAnonymousMessage(message).catch((err) => {
      logger.error({ err }, "Anonim sohbet hatası");
      return false;
    });
    if (anonymousHandled) return;

    // Guard kontrolleri (komut olmayan mesajlarda)
    const spamBlocked = await handleSpam(message).catch(() => false);
    if (spamBlocked) return;
    const linkBlocked = await handleLink(message).catch(() => false);
    if (linkBlocked) return;
    await handleEmoji(message).catch(() => null);

    // XP kazanımı — level sistemi kapalıysa atla
    const levelEnabled = await getLevelEnabled(message.guildId).catch(() => true);
    if (!levelEnabled) return;
    const result = await handleXp(message.author.id, message.guildId, message.guild ?? undefined).catch(() => null);
    if (result?.leveledUp) {
      try {
        const buf = await generateLevelUpCard({
          username: message.author.displayName,
          avatarUrl: message.author.displayAvatarURL({ extension: "png", size: 256 }),
          oldLevel: result.oldLevel, newLevel: result.newLevel,
        });
        await message.channel.send({ content: `${message.author}`, files: [new AttachmentBuilder(buf, { name: "levelup.png" })] });
      } catch {
        await message.channel.send(`🎉 ${message.author} **${result.newLevel}. seviyeye** ulaştı!`).catch(() => null);
      }
    }
  });

  // ── Stat kanalları periyodik güncelleme (her 10 dakika) ───────────────────
  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      await updateStatChannels(guild).catch(() => null);
    }
  }, 10 * 60_000);

  await client.login(token);
}
