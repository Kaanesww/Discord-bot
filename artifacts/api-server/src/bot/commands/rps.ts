import {
  ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder,
  ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType,
} from "discord.js";

type Choice = "taş" | "kağıt" | "makas";
const EMOJI: Record<Choice, string> = { "taş": "🪨", "kağıt": "📄", "makas": "✂️" };

function getWinner(a: Choice, b: Choice): "a" | "b" | "draw" {
  if (a === b) return "draw";
  if ((a === "taş" && b === "makas") || (a === "makas" && b === "kağıt") || (a === "kağıt" && b === "taş")) return "a";
  return "b";
}

export const data = new SlashCommandBuilder()
  .setName("rps")
  .setDescription("🪨📄✂️ Taş-Kağıt-Makas — birine meydan oku!")
  .addUserOption((o) => o.setName("rakip").setDescription("Rakip").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const opponent = interaction.options.getUser("rakip", true);
  if (opponent.id === interaction.user.id) { await interaction.reply({ content: "❌ Kendinle oynayamazsın.", ephemeral: true }); return; }
  if (opponent.bot) { await interaction.reply({ content: "❌ Botlarla oynayamazsın.", ephemeral: true }); return; }

  const choices: Choice[] = ["taş", "kağıt", "makas"];
  const makeRow = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...choices.map((c) => new ButtonBuilder().setCustomId(c).setLabel(`${EMOJI[c]} ${c.charAt(0).toUpperCase() + c.slice(1)}`).setStyle(ButtonStyle.Primary)),
  );

  const p1Choice = new Map<string, Choice>();

  const msg = await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("🪨📄✂️ Taş-Kağıt-Makas").setDescription(`<@${interaction.user.id}> vs <@${opponent.id}>\n\nHer iki oyuncu da seçimini yapsın!`)],
    components: [makeRow()],
    fetchReply: true,
  });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => [interaction.user.id, opponent.id].includes(i.user.id),
    time: 60_000,
  });

  collector.on("collect", async (i) => {
    if (p1Choice.has(i.user.id)) {
      await i.reply({ content: "✅ Seçimini zaten yaptın.", ephemeral: true });
      return;
    }
    p1Choice.set(i.user.id, i.customId as Choice);
    await i.reply({ content: `✅ **${EMOJI[i.customId as Choice]} ${i.customId}** seçtin!`, ephemeral: true });

    if (p1Choice.has(interaction.user.id) && p1Choice.has(opponent.id)) {
      collector.stop("both_chosen");
    }
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

    const desc = result === "draw"
      ? `**Berabere!** İkiniz de ${EMOJI[c1]} seçtiniz.`
      : result === "a"
        ? `🏆 **<@${interaction.user.id}>** kazandı! ${EMOJI[c1]} > ${EMOJI[c2]}`
        : `🏆 **<@${opponent.id}>** kazandı! ${EMOJI[c2]} > ${EMOJI[c1]}`;

    const embed = new EmbedBuilder()
      .setColor(result === "draw" ? 0x72767d : 0xffd700)
      .setTitle("🪨📄✂️ Sonuç!")
      .setDescription(desc)
      .addFields(
        { name: interaction.user.displayName, value: `${EMOJI[c1]} ${c1}`, inline: true },
        { name: opponent.displayName, value: `${EMOJI[c2]} ${c2}`, inline: true },
      );
    await interaction.editReply({ embeds: [embed], components: [] });
  });
}
