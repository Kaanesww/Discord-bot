import {
  ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder,
  ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, User,
} from "discord.js";
import { getBalance, addCoins, takeCoins } from "../economy";

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

const FLIP_ANIM = [
  "🟡      ", "  🟡    ", "    🟡  ", "      🟡",
  "    🟡  ", "  🟡    ", "🟡      ",
];

export const data = new SlashCommandBuilder()
  .setName("coinflip")
  .setDescription("🪙 Para at — yazı mı tura mı?")
  .addIntegerOption((o) => o.setName("miktar").setDescription("Bahis miktarı (min 10)").setMinValue(10).setRequired(true))
  .addUserOption((o) => o.setName("rakip").setDescription("Rakip (boş = bota karşı)").setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) { await interaction.reply({ content: "❌ Sadece sunucularda çalışır.", ephemeral: true }); return; }
  const bet = interaction.options.getInteger("miktar", true);
  const opponent: User | null = interaction.options.getUser("rakip");

  // ── Bot vs Kullanıcı ───────────────────────────────────
  if (!opponent || opponent.id === interaction.user.id || opponent.bot) {
    await interaction.deferReply();
    const bal = await getBalance(interaction.user.id, interaction.guildId);
    if (bal.coins < bet) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("❌ Yetersiz Bakiye").setDescription(`Bakiyen: **${bal.coins.toLocaleString("tr-TR")}** ⬤V`)] });
      return;
    }

    // Seçim ekranı — Yazı mı Tura mı?
    const choiceRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("cf_yazı").setLabel("📜 Yazı").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("cf_tura").setLabel("🔘 Tura").setStyle(ButtonStyle.Primary),
    );
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xffd700).setTitle("🪙 Coinflip").setDescription(`Bahis: **${bet.toLocaleString("tr-TR")}** ⬤V\n\n**Yazı mı tura mı seç!**`).setFooter({ text: "30 saniye içinde seç." })],
      components: [choiceRow],
    });

    const msg = await interaction.fetchReply();
    let chosenSide: "yazı" | "tura" | null = null;
    try {
      const btn = await msg.awaitMessageComponent({ componentType: ComponentType.Button, filter: (i) => i.user.id === interaction.user.id, time: 30_000 });
      chosenSide = btn.customId === "cf_yazı" ? "yazı" : "tura";
      await btn.deferUpdate();
    } catch {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x72767d).setTitle("⏰ Süre Doldu").setDescription("Coinflip iptal.")], components: [] });
      return;
    }

    await interaction.editReply({ components: [] });

    // Animasyon
    for (const frame of FLIP_ANIM) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xffd700).setTitle("🪙 Para havada...").setDescription(`\`[ ${frame} ]\`\n\n*Dönüyor...*`)] });
      await sleep(200);
    }

    const result: "yazı" | "tura" = Math.random() < 0.5 ? "yazı" : "tura";
    const won = result === chosenSide;
    let newBal: number;
    if (won) { newBal = await addCoins(interaction.user.id, interaction.guildId, bet); }
    else { newBal = await takeCoins(interaction.user.id, interaction.guildId, bet); }

    const resultEmbed = new EmbedBuilder()
      .setColor(won ? 0x57f287 : 0xed4245)
      .setTitle(won ? "🎉 Kazandın!" : "💸 Kaybettin!")
      .setDescription(
        `Para **${result === "yazı" ? "📜 Yazı" : "🔘 Tura"}** düştü!\n` +
        `Senin seçimin: **${chosenSide === "yazı" ? "📜 Yazı" : "🔘 Tura"}**`,
      )
      .addFields(
        { name: "Bahis", value: `${bet.toLocaleString("tr-TR")} ⬤V`, inline: true },
        { name: won ? "Kazanç" : "Kayıp", value: `${won ? "+" : "-"}${bet.toLocaleString("tr-TR")} ⬤V`, inline: true },
        { name: "Yeni Bakiye", value: `**${newBal.toLocaleString("tr-TR")} ⬤V**` },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [resultEmbed] });
    return;
  }

  // ── 1v1 ────────────────────────────────────────────────
  const bal1 = await getBalance(interaction.user.id, interaction.guildId);
  if (bal1.coins < bet) {
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("❌ Yetersiz Bakiye").setDescription(`Bakiyen: **${bal1.coins.toLocaleString("tr-TR")}** ⬤V`)], ephemeral: true });
    return;
  }

  const acceptRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("cf1v1_accept").setLabel("✅ Kabul Et").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("cf1v1_decline").setLabel("❌ Reddet").setStyle(ButtonStyle.Danger),
  );
  await interaction.reply({
    content: `${opponent}`,
    embeds: [new EmbedBuilder().setColor(0xffd700).setTitle("🪙 1v1 Coinflip Daveti").setDescription(`**${interaction.user.displayName}** seni **${bet.toLocaleString("tr-TR")} ⬤V** bahis için davet ediyor!\n\nKabul ediyor musun?`).setFooter({ text: "60 saniye içinde kabul et." })],
    components: [acceptRow],
  });

  const msg = await interaction.fetchReply();
  let accepted = false;
  try {
    const btn = await msg.awaitMessageComponent({ componentType: ComponentType.Button, filter: (i) => i.user.id === opponent.id, time: 60_000 });
    if (btn.customId === "cf1v1_decline") {
      await btn.update({ embeds: [new EmbedBuilder().setColor(0x72767d).setTitle("❌ Reddedildi").setDescription(`${opponent.displayName} daveti reddetti.`)], components: [] });
      return;
    }
    accepted = true;
    await btn.deferUpdate();
  } catch {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x72767d).setTitle("⏰ Süre Doldu")], components: [] });
    return;
  }

  if (!accepted) return;

  const bal2 = await getBalance(opponent.id, interaction.guildId);
  if (bal2.coins < bet) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("❌ Rakibin Bakiyesi Yetersiz").setDescription(`${opponent.displayName}'in bakiyesi: **${bal2.coins.toLocaleString("tr-TR")}** ⬤V`)], components: [] });
    return;
  }

  await interaction.editReply({ components: [] });

  // Animasyon
  for (const frame of FLIP_ANIM) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xffd700).setTitle("🪙 Para havada...").setDescription(`\`[ ${frame} ]\`\n\n*Dönüyor...*`)] });
    await sleep(200);
  }

  const winner = Math.random() < 0.5 ? interaction.user : opponent;
  const loser = winner.id === interaction.user.id ? opponent : interaction.user;
  await addCoins(winner.id, interaction.guildId, bet);
  await takeCoins(loser.id, interaction.guildId, bet);
  const winBal = await getBalance(winner.id, interaction.guildId);
  const losBal = await getBalance(loser.id, interaction.guildId);

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("🪙 Coinflip Sonucu!")
      .setDescription(`🎉 **${winner.displayName}** kazandı!`)
      .addFields(
        { name: "🏆 Kazanan", value: `${winner.displayName} **+${bet.toLocaleString("tr-TR")} ⬤V** → ${winBal.coins.toLocaleString("tr-TR")} ⬤V`, inline: false },
        { name: "💸 Kaybeden", value: `${loser.displayName} **-${bet.toLocaleString("tr-TR")} ⬤V** → ${losBal.coins.toLocaleString("tr-TR")} ⬤V`, inline: false },
      )
      .setTimestamp()],
  });
}
