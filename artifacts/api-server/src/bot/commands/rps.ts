import {
  ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder,
  ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType,
} from "discord.js";
import { getBalance, addCoins, takeCoins } from "../economy";

type Choice = "taş" | "kağıt" | "makas";
const EMOJI: Record<Choice, string> = { "taş": "🪨", "kağıt": "📄", "makas": "✂️" };

function getWinner(a: Choice, b: Choice): "a" | "b" | "draw" {
  if (a === b) return "draw";
  if (
    (a === "taş" && b === "makas") ||
    (a === "makas" && b === "kağıt") ||
    (a === "kağıt" && b === "taş")
  ) return "a";
  return "b";
}

export const data = new SlashCommandBuilder()
  .setName("rps")
  .setDescription("🪨📄✂️ Taş-Kağıt-Makas — rakibe meydan oku!")
  .addUserOption((o) => o.setName("rakip").setDescription("Rakip kullanıcı").setRequired(true))
  .addIntegerOption((o) =>
    o.setName("miktar").setDescription("Bahis miktarı (opsiyonel, min 10)").setMinValue(10).setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const opponent = interaction.options.getUser("rakip", true);
  const bet      = interaction.options.getInteger("miktar") ?? 0;

  if (opponent.id === interaction.user.id) {
    await interaction.reply({ content: "❌ Kendinle oynayamazsın.", ephemeral: true }); return;
  }
  if (opponent.bot) {
    await interaction.reply({ content: "❌ Botlarla oynayamazsın.", ephemeral: true }); return;
  }

  const hasBet = bet > 0;

  if (hasBet) {
    const bal1 = await getBalance(interaction.user.id);
    if (bal1.coins < bet) {
      await interaction.reply({ content: `❌ Yetersiz bakiye! Bakiyen: **${bal1.coins.toLocaleString("tr-TR")} ⬤V**`, ephemeral: true }); return;
    }
  }

  const choices: Choice[] = ["taş", "kağıt", "makas"];
  const makeRow = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...choices.map((c) =>
      new ButtonBuilder().setCustomId(c).setLabel(`${EMOJI[c]} ${c.charAt(0).toUpperCase() + c.slice(1)}`).setStyle(ButtonStyle.Primary),
    ),
  );

  if (hasBet) {
    const acceptRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("rps_accept").setLabel("✅ Kabul Et").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("rps_decline").setLabel("❌ Reddet").setStyle(ButtonStyle.Danger),
    );
    const invMsg = await interaction.reply({
      content: `${opponent} — **${interaction.user.displayName}** sana **${bet.toLocaleString("tr-TR")} ⬤V** bahisli TKM daveti gönderdi!\nKabul ediyor musun? *(30 sn)*`,
      components: [acceptRow],
      fetchReply: true,
    });

    try {
      const invBtn = await invMsg.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === opponent.id,
        time: 30_000,
      });
      if (invBtn.customId === "rps_decline") {
        await invBtn.update({ content: `❌ **${opponent.displayName}** daveti reddetti.`, components: [] }); return;
      }
      await invBtn.deferUpdate();
    } catch {
      await interaction.editReply({ content: "⏰ Süre doldu. Oyun iptal.", components: [] }); return;
    }

    const bal2 = await getBalance(opponent.id);
    if (bal2.coins < bet) {
      await interaction.editReply({ content: `❌ **${opponent.displayName}** bakiyesi yetersiz! (${bal2.coins.toLocaleString("tr-TR")} ⬤V)`, components: [] }); return;
    }
  }

  const p1Choice = new Map<string, Choice>();

  const statusEmbed = () => new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🪨📄✂️ Taş-Kağıt-Makas" + (hasBet ? ` — ${bet.toLocaleString("tr-TR")} ⬤V` : ""))
    .setDescription(
      `<@${interaction.user.id}> vs <@${opponent.id}>\n\n` +
      `${p1Choice.has(interaction.user.id) ? "✅" : "⏳"} **${interaction.user.displayName}** — ${p1Choice.has(interaction.user.id) ? "Seçti!" : "Bekleniyor..."}\n` +
      `${p1Choice.has(opponent.id) ? "✅" : "⏳"} **${opponent.displayName}** — ${p1Choice.has(opponent.id) ? "Seçti!" : "Bekleniyor..."}`,
    );

  const gameMsg = hasBet
    ? await interaction.editReply({ embeds: [statusEmbed()], components: [makeRow()] })
    : await interaction.reply({ embeds: [statusEmbed()], components: [makeRow()], fetchReply: true });

  const collector = gameMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => [interaction.user.id, opponent.id].includes(i.user.id),
    time: 60_000,
  });

  collector.on("collect", async (i) => {
    if (p1Choice.has(i.user.id)) {
      await i.reply({ content: "✅ Seçimini zaten yaptın.", ephemeral: true }); return;
    }
    p1Choice.set(i.user.id, i.customId as Choice);
    await i.reply({ content: `✅ **${EMOJI[i.customId as Choice]} ${i.customId}** seçtin! Rakip seçene kadar bekle.`, ephemeral: true });
    await interaction.editReply({ embeds: [statusEmbed()], components: [makeRow()] });
    if (p1Choice.has(interaction.user.id) && p1Choice.has(opponent.id)) collector.stop("both_chosen");
  });

  collector.on("end", async (_, reason) => {
    if (reason !== "both_chosen") {
      const who = !p1Choice.has(interaction.user.id) ? interaction.user.displayName : opponent.displayName;
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x72767d).setTitle("⏰ Süre Doldu").setDescription(`**${who}** seçim yapmadı. Oyun iptal.`)], components: [] });
      return;
    }

    const c1 = p1Choice.get(interaction.user.id)!;
    const c2 = p1Choice.get(opponent.id)!;
    const result = getWinner(c1, c2);

    let desc = "";
    let winnerId: string | null = null;
    let loserId:  string | null = null;

    if (result === "draw") {
      desc = `**Berabere!** İkiniz de ${EMOJI[c1]} seçtiniz.`;
    } else if (result === "a") {
      desc = `🏆 **<@${interaction.user.id}>** kazandı! ${EMOJI[c1]} > ${EMOJI[c2]}`;
      winnerId = interaction.user.id; loserId = opponent.id;
    } else {
      desc = `🏆 **<@${opponent.id}>** kazandı! ${EMOJI[c2]} > ${EMOJI[c1]}`;
      winnerId = opponent.id; loserId = interaction.user.id;
    }

    let extraLines = "";
    if (hasBet) {
      if (winnerId && loserId) {
        await addCoins(winnerId, bet);
        await takeCoins(loserId, bet);
        const wb = await getBalance(winnerId);
        const lb = await getBalance(loserId);
        const wName = winnerId === interaction.user.id ? interaction.user.displayName : opponent.displayName;
        const lName = loserId  === interaction.user.id ? interaction.user.displayName : opponent.displayName;
        extraLines =
          `\n\n💰 **${wName}**: +${bet.toLocaleString("tr-TR")} ⬤V → ${wb.coins.toLocaleString("tr-TR")} ⬤V\n` +
          `💸 **${lName}**: -${bet.toLocaleString("tr-TR")} ⬤V → ${lb.coins.toLocaleString("tr-TR")} ⬤V`;
      } else {
        extraLines = `\n\n🤝 Beraberlik — bahisler iade edildi.`;
      }
    }

    const embed = new EmbedBuilder()
      .setColor(result === "draw" ? 0x72767d : 0xffd700)
      .setTitle("🪨📄✂️ Sonuç!" + (hasBet ? ` — ${bet.toLocaleString("tr-TR")} ⬤V` : ""))
      .setDescription(desc + extraLines)
      .addFields(
        { name: interaction.user.displayName, value: `${EMOJI[c1]} ${c1}`, inline: true },
        { name: opponent.displayName,         value: `${EMOJI[c2]} ${c2}`, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], components: [] });
  });
}
