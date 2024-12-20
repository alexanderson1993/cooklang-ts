const metadata = /^>>\s*(.+?):\s*(.+)/;

const multiwordIngredient = /@([^@#~[]+?)\{([^]*?)(?:%([^}]+?))?\}(?:\(([^]*?)\))?/;
const singleWordIngredient = /@([^\s\t\p{Zs}\p{P}]+)/;

const multiwordCookware = /#([^@#~[]+?)\{(.*?)\}/;
const singleWordCookware = /#([^\s\t\p{Zs}\p{P}]+)/;

const timer = /~(.*?)(?:\{(.*?)(?:%(.*?))?\})/;

export const comment = /--.*/g;
export const blockComment = /\s*\[\-[\s\S]*?\-\]\s*/g;

export const shoppingList = /\n\s*\[(.+)\]\n([^]*?)(?:\n\n|$)/g;
export const tokens = new RegExp(
    [metadata, multiwordIngredient, singleWordIngredient, multiwordCookware, singleWordCookware, timer]
        .map((r) => r.source)
        .join("|"),
    "gu"
);
