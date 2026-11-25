// Material Symbols icon set used by the PathSync interface.
// Keeps the original <Icon name="..." /> API so existing screens keep working.
const NAMES = {
  home: "home",
  learn: "menu_book",
  award: "workspace_premium",
  chat: "forum",
  user: "person",
  lock: "lock",
  check: "check",
  back: "arrow_back",
  forward: "arrow_forward",
  chevron: "chevron_right",
  insights: "insights",
  mail: "mail",
  visibility: "visibility",
  verified: "verified",
  streak: "local_fire_department",
  quote: "format_quote",
  explore: "explore",
  engineering: "engineering",
  schedule: "schedule",
  checkCircle: "check_circle",
  bolt: "bolt",
  send: "send",
  download: "download",
  logout: "logout",
  search: "search",
  school: "school",
  quiz: "quiz",
  book: "auto_stories",
  sparkle: "auto_awesome",
  trophy: "emoji_events",
  refresh: "refresh",
  arrowUp: "arrow_upward",
};

export default function Icon({ name, size = 22, filled = false }) {
  const glyph = NAMES[name] || name;
  return (
    <span
      className={filled ? "mi fill" : "mi"}
      style={{ fontSize: size }}
      aria-hidden="true"
    >
      {glyph}
    </span>
  );
}
