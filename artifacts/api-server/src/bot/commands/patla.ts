import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";

const PATLAMALAR = [
  { art: "```\n    💥\n  💥💥💥\n💥💥💥💥💥\n  💥💥💥\n    💥\n```", msg: "BOOOOM! Sunucu patladı!" },
  { art: "```\n       🔥\n     🔥🔥🔥\n   🔥🔥💥🔥🔥\n     🔥🔥🔥\n       🔥\n```", msg: "Yangın çıktı! 🚒" },
  { art: "```\n ★ * ·  ˚  💥  ˚ · * ★\n★  💥   BOOM!   💥  ★\n ★ * ·  ˚  💥  ˚ · * ★\n```", msg: "Atomik patlama!" },
  { art: "```\n  .  *  .  ˚  .  *  .\n*  💣 → 💥 PATLADI! 💥\n  .  *  .  ˚  .  *  .\n```", msg: "Bomba atıldı! 🫡" },
];

const HEDEFLER = [
  "sunucu yerle bir oldu",
  "kanallar havaya uçtu",
  "herkes darmadağın oldu",
  "komşu sunuculara zarar verdi",
  "Discord API bile titredi",
  "Wumpus kaçtı",
];

export const data = new SlashCommandBuilder()
  .setName("patla")
  .setDescription("💥 Sunucuyu patlat! (Eğlence)")
  .addUserOption((o) => o.setName("hedef").setDescription("Kim patlasın?").setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("hedef");
  const { art, msg } = PATLAMALAR[Math.floor(Math.random() * PATLAMALAR.length)]!;
  const hedef = HEDEFLER[Math.floor(Math.random() * HEDEFLER.length)]!;

  const desc = target
    ? `<@${target.id}> 💥 **PATLADIIIIII!**\n${hedef}!\n\n${art}`
    : `Sunucu ${hedef}!\n\n${art}`;

  const embed = new EmbedBuilder()
    .setColor(0xff4500)
    .setTitle(`💥 ${msg}`)
    .setDescription(desc)
    .setFooter({ text: `Patlatan: ${interaction.user.displayName}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
