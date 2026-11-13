// Sharing a client's private link (Client page card on the customer page, the owner's dashboard banner).
// Client-safe: no server imports.

/** The French WhatsApp message that carries a client's link. */
export function clientLinkMessage(firstName: string, link: string): string {
  return (
    `Bonjour${firstName ? ` ${firstName}` : ""} 👋\n` +
    `Voici votre espace client ONDE : vos taps jour par jour, et le lien de vos produits que vous pouvez changer à tout moment.\n` +
    `${link}\n\n` +
    `Ce lien est personnel : gardez-le pour vous et votre équipe.`
  );
}

/** wa.me link to the customer's chat (or the chat picker when there is no Tunisian mobile) with the message. */
export function clientLinkWhatsapp(phone: string | null, firstName: string, link: string): string {
  return `https://wa.me/${phone ? `216${phone}` : ""}?text=${encodeURIComponent(clientLinkMessage(firstName, link))}`;
}

/** Clipboard write with the old execCommand fallback (plain-HTTP origins, older iOS). */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}
