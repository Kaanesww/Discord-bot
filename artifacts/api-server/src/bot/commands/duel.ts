import {
  ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder,
  ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType,
} from "discord.js";
import { getBalance, addCoins, takeCoins } from "../economy";

export const data = new SlashCommandBuilder()
  .setName("duel")
  .setDescription("⚔️ Birine yazı-tura düellosu meydan oku!")
  .addUserOption((o) => o.setName("rakip").setDescription("Meydan okunan kişi").setRequired(true))
  .addIntegerOption((o) => o.setName("bahis").setDescription("Bahis miktarı").setMinValue(10).setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const opponent = interaction.options.getUser("rakip", true);
  const bet = interaction.options.getInteger("bahis", true);

  if (opponent.id === interaction.user.id) {
    await interaction.reply({ content: "❌ Kendinle düello yapamazsın.", ephemeral: true }); return;
  }
  if (opponent.bot) {
    await interaction.reply({ content: "❌ Botlarla düello yapamazsın.", ephemeral: true }); return;
  }

  await interaction.deferReply();

  const chalBal = await getBalance(interaction.user.id);
  const oppBal  = await getBalance(opponent.id);

  if (chalBal.coins < bet) {
    await interaction.editReply(`❌ Yetersiz bakiye. Bakiyen: **${chalBal.coins.toLocaleString("tr-TR")} ⬤V**`); return;
  }
  if (oppBal.coins < bet) {
    await interaction.editReply(`❌ **${opponent.displayName}** yeterli bakiyeye sahip değil (${oppBal.coins.toLocaleString("tr-TR")} ⬤V).`); return;
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("duel_accept").setLabel("✅ Kabul Et").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("duel_reject").setLabel("❌ Reddet").setStyle(ButtonStyle.Danger),
  );

  const challengeEmbed = new EmbedBuilder()
    .setColor(0xfaa61a)
    .setTitle("⚔️ Düello Meydan Okuma!")
    .setDescription(`<@${opponent.id}>, <@${interaction.user.id}> sana **${bet.toLocaleString("tr-TR")} ⬤V** bahisle yazı-tura düellosu meydan okuyor!\n\n**30 saniye içinde kabul et veya reddet.**`)
    .setTimestamp();

  const msg = await interaction.editReply({ embeds: [challengeEmbed], components: [row] });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === opponent.id,
    time: 30_000, max: 1,
  });

  collector.on("collect", async (i) => {
    if (i.customId === "duel_reject") {
      await i.update({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("⚔️ Düello Reddedildi").setDescription(`<@${opponent.id}> düelloyu reddetti.`)], components: [] });
      return;
    }

    const challengerWins = Math.random() < 0.5;
    const winner = challengerWins ? interaction.user : opponent;
    const loser  = challengerWins ? opponent : interaction.user;

    await takeCoins(loser.id, bet);
    const newBal = await addCoins(winner.id, bet);

    const resultEmbed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("⚔️ Düello Sonucu!")
      .setDescription(`🪙 Yazı-tura atıldı...\n\n🏆 **<@${winner.id}>** kazandı!`)
      .addFields(
        { name: "Kazanan", value: `<@${winner.id}>`, inline: true },
        { name: "Kaybeden", value: `<@${loser.id}>`, inline: true },
        { name: "Ödül", value: `**+${bet.toLocaleString("tr-TR")} ⬤V**`, inline: true },
        { name: "Kazananın Yeni Bakiyesi", value: `**${newBal.toLocaleString("tr-TR")} ⬤V**` },
      )
      .setTimestamp();

    await i.update({ embeds: [resultEmbed], components: [] });
  });

  collector.on("end", async (collected) => {
    if (collected.size === 0) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x72767d).setTitle("⚔️ Süre Doldu").setDescription("Düello kabul edilmedi, iptal edildi.")], components: [] });
    }
  });
}
