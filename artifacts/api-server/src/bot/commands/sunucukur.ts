import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  ChannelType,
  CategoryChannel,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("sunucukur")
  .setDescription("Sunucuya tüm kategori ve kanalları otomatik oluşturur")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

interface ChannelDef {
  name: string;
  type: "text" | "voice";
}

interface CategoryDef {
  name: string;
  channels: ChannelDef[];
}

const STRUCTURE: CategoryDef[] = [
  {
    name: "📂 ① BİLGİLENDİRME",
    channels: [
      { name: "📜・bilgiler", type: "text" },
      { name: "📖・kurallar", type: "text" },
      { name: "📢・duyurular", type: "text" },
      { name: "📅・etkinlikler", type: "text" },
      { name: "🎁・çekilişler", type: "text" },
      { name: "💎・boost-ödülleri", type: "text" },
    ],
  },
  {
    name: "🌍 ② GENEL",
    channels: [
      { name: "💬・topluluk", type: "text" },
      { name: "💬・genel-sohbet", type: "text" },
      { name: "🤖・bot-komut", type: "text" },
      { name: "😂・meme", type: "text" },
      { name: "📸・medya", type: "text" },
      { name: "🎤・ses-kanalı", type: "voice" },
    ],
  },
  {
    name: "🦉 ③ OWO",
    channels: [
      { name: "🐾・owo-dünya", type: "text" },
      { name: "🦉・owo-chat", type: "text" },
      { name: "⚔️・battle", type: "text" },
      { name: "🎰・gambling", type: "text" },
      { name: "💰・trade-market", type: "text" },
      { name: "🐉・pet-showcase", type: "text" },
      { name: "📦・loot-flex", type: "text" },
      { name: "📊・leaderboard", type: "text" },
    ],
  },
  {
    name: "👑 ④ VIP",
    channels: [
      { name: "✨・vip-lounge", type: "text" },
      { name: "💬・vip-chat", type: "text" },
      { name: "🦉・vip-owo", type: "text" },
      { name: "🎤・vip-ses", type: "voice" },
    ],
  },
  {
    name: "💠 ⑤ PREMIUM",
    channels: [
      { name: "💎・premium-lounge", type: "text" },
      { name: "💬・premium-chat", type: "text" },
      { name: "🦉・premium-owo", type: "text" },
      { name: "🤖・premium-bot", type: "text" },
      { name: "🎤・premium-ses", type: "voice" },
    ],
  },
  {
    name: "🌸 ⑥ DESTEK",
    channels: [
      { name: "🎫・ticket", type: "text" },
      { name: "❓・yardım", type: "text" },
      { name: "📩・öneriler", type: "text" },
    ],
  },
];

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "❌ Bu komut sadece sunucularda çalışır.", ephemeral: true });
    return;
  }

  const isOwner = interaction.guild.ownerId === interaction.user.id;
  const member = interaction.guild.members.cache.get(interaction.user.id)
    ?? await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isAdmin = member?.permissions.has(PermissionFlagsBits.Administrator) ?? false;

  if (!isOwner && !isAdmin) {
    await interaction.reply({ content: "❌ Bu komutu sadece sunucu sahibi veya yöneticiler kullanabilir.", ephemeral: true });
    return;
  }

  await interaction.reply({
    content: "⏳ Kategori ve kanallar oluşturuluyor, lütfen bekle...",
    ephemeral: true,
  });

  let created = 0;
  const errors: string[] = [];

  for (const catDef of STRUCTURE) {
    let category: CategoryChannel;
    try {
      category = await interaction.guild.channels.create({
        name: catDef.name,
        type: ChannelType.GuildCategory,
        reason: `sunucukur — ${interaction.user.tag}`,
      });
      created++;
    } catch (err) {
      errors.push(`Kategori oluşturulamadı: ${catDef.name}`);
      continue;
    }

    for (const chDef of catDef.channels) {
      try {
        await interaction.guild.channels.create({
          name: chDef.name,
          type: chDef.type === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText,
          parent: category.id,
          reason: `sunucukur — ${interaction.user.tag}`,
        });
        created++;
      } catch {
        errors.push(`Kanal oluşturulamadı: ${chDef.name}`);
      }
    }
  }

  const errorText = errors.length > 0
    ? `\n\n⚠️ Bazı kanallar oluşturulamadı:\n${errors.map((e) => `• ${e}`).join("\n")}`
    : "";

  await interaction.editReply({
    content: `✅ Tamamlandı! Toplam **${created}** kategori/kanal oluşturuldu.${errorText}`,
  });
}
