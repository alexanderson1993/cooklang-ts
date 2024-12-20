import { comment, blockComment, shoppingList as shoppingListRegex, tokens } from "./tokens";
import { Ingredient, Cookware, Step, Metadata, Item, ShoppingList } from "./cooklang";

/**
 * @property defaultCookwareAmount The default value to pass if there is no cookware amount. By default the amount is 1
 * @property defaultIngredientAmount The default value to pass if there is no ingredient amount. By default the amount is "some"
 * @property includeStepNumber Whether or not to include the step number in ingredient and cookware nodes
 *
 */
export interface ParserOptions {
    defaultCookwareAmount?: string | number;
    defaultIngredientAmount?: string | number;
    includeStepNumber?: boolean;
}

export interface ParseResult {
    ingredients: Array<Ingredient>;
    cookwares: Array<Cookware>;
    metadata: Metadata;
    steps: Array<Step>;
    shoppingList: ShoppingList;
}

export default class Parser {
    defaultCookwareAmount: string | number;
    defaultIngredientAmount: string | number;
    includeStepNumber: boolean;
    defaultUnits = "";

    /**
     * Creates a new parser with the supplied options
     *
     * @param options The parser's options
     */
    constructor(options?: ParserOptions) {
        this.defaultCookwareAmount = options?.defaultCookwareAmount ?? 1;
        this.defaultIngredientAmount = options?.defaultIngredientAmount ?? "some";
        this.includeStepNumber = options?.includeStepNumber ?? false;
    }

    /**
     * Parses a Cooklang string and returns any metadata, steps, or shopping lists
     *
     * @param source A Cooklang recipe
     * @returns The extracted ingredients, cookwares, metadata, steps, and shopping lists
     *
     * @see {@link https://cooklang.org/docs/spec/#the-cook-recipe-specification|Cooklang Recipe}
     */
    parse(source: string): ParseResult {
        const ingredients: Array<Ingredient> = [];
        const cookwares: Array<Cookware> = [];
        const metadata: Metadata = {};
        const steps: Array<Step> = [];
        const shoppingList: ShoppingList = {};

        // Comments
        source = source.replace(comment, "").replace(blockComment, " ");

        // Parse shopping lists
        for (let match of source.matchAll(shoppingListRegex)) {
            const groups = createNamedGroups(match, "shoppingList");
            if (!groups?.name) continue;

            shoppingList[groups.name] = parseShoppingListCategory(groups.items || "");

            // Remove it from the source
            source = source.substring(0, match.index || 0);
            +source.substring((match.index || 0) + match[0].length);
        }

        const lines = source.split(/\r?\n/).filter((l) => l.trim().length > 0);

        let stepNumber = 0;
        stepLoop: for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            const step: Step = [];

            let pos = 0;
            for (let match of line.matchAll(tokens)) {
                // metadata
                const metadataGroups = createNamedGroups(match, "metadata");
                if (metadataGroups?.key && metadataGroups.value) {
                    metadata[metadataGroups.key.trim()] = metadataGroups.value.trim();

                    continue stepLoop;
                }

                // text
                if (pos < (match.index || 0)) {
                    step.push({
                        type: "text",
                        value: line.substring(pos, match.index),
                    });
                }

                // single word ingredient
                const sIngredientGroup = createNamedGroups(match, "singleWordIngredient");
                if (sIngredientGroup?.sIngredientName) {
                    const ingredient: Ingredient = {
                        type: "ingredient",
                        name: sIngredientGroup.sIngredientName,
                        quantity: this.defaultIngredientAmount,
                        units: this.defaultUnits,
                    };

                    if (this.includeStepNumber) ingredient.step = stepNumber;

                    ingredients.push(ingredient);
                    step.push(ingredient);
                }

                // multiword ingredient
                const mIngredientGroup = createNamedGroups(match, "multiwordIngredient");
                if (mIngredientGroup?.mIngredientName) {
                    const ingredient: Ingredient = {
                        type: "ingredient",
                        name: mIngredientGroup.mIngredientName,
                        quantity: parseQuantity(mIngredientGroup.mIngredientQuantity) ?? this.defaultIngredientAmount,
                        units: parseUnits(mIngredientGroup.mIngredientUnits) ?? this.defaultUnits,
                        ...(mIngredientGroup.mIngredientPreparation
                            ? { preparation: mIngredientGroup.mIngredientPreparation }
                            : null),
                    };

                    if (this.includeStepNumber) ingredient.step = stepNumber;

                    ingredients.push(ingredient);
                    step.push(ingredient);
                }

                // single word cookware
                const sCookwareGroup = createNamedGroups(match, "singleWordCookware");
                if (sCookwareGroup?.sCookwareName) {
                    const cookware: Cookware = {
                        type: "cookware",
                        name: sCookwareGroup.sCookwareName,
                        quantity: this.defaultCookwareAmount,
                    };

                    if (this.includeStepNumber) cookware.step = stepNumber;

                    cookwares.push(cookware);
                    step.push(cookware);
                }

                // multiword cookware
                const mCookwareGroup = createNamedGroups(match, "multiwordCookware");
                if (mCookwareGroup?.mCookwareName) {
                    const cookware: Cookware = {
                        type: "cookware",
                        name: mCookwareGroup?.mCookwareName,
                        quantity: parseQuantity(mCookwareGroup?.mCookwareQuantity) ?? this.defaultCookwareAmount,
                    };

                    if (this.includeStepNumber) cookware.step = stepNumber;

                    cookwares.push(cookware);
                    step.push(cookware);
                }

                // timer
                const timerGroup = createNamedGroups(match, "timer");
                if (timerGroup?.timerQuantity) {
                    step.push({
                        type: "timer",
                        name: timerGroup.timerName,
                        quantity: parseQuantity(timerGroup.timerQuantity) ?? 0,
                        units: parseUnits(timerGroup.timerUnits) ?? this.defaultUnits,
                    });
                }

                pos = (match.index || 0) + match[0].length;
            }

            // If the entire line hasn't been parsed yet
            if (pos < line.length) {
                // Add the rest as a text item
                step.push({
                    type: "text",
                    value: line.substring(pos),
                });
            }

            if (step.length > 0) {
                steps.push(step);
                stepNumber++;
            }
        }

        return { ingredients, cookwares, metadata, steps, shoppingList };
    }
}

function parseQuantity(quantity?: string): string | number | undefined {
    if (!quantity || quantity.trim() === "") {
        return undefined;
    }

    quantity = quantity.trim();

    const [left, right] = quantity.split("/");

    const [numLeft, numRight] = [Number(left), Number(right)];

    if (right && isNaN(numRight)) return quantity;

    if (!isNaN(numLeft) && !numRight) return numLeft;
    else if (!isNaN(numLeft) && !isNaN(numRight) && !(left.startsWith("0") || right.startsWith("0")))
        return numLeft / numRight;

    return quantity.trim();
}

function parseUnits(units?: string): string | undefined {
    if (!units || units.trim() === "") {
        return undefined;
    }

    return units.trim();
}

function parseShoppingListCategory(items: string): Array<Item> {
    const list = [];

    for (let item of items.split("\n")) {
        item = item.trim();

        if (item == "") continue;

        const [name, synonym] = item.split("|");

        list.push({
            name: name.trim(),
            synonym: synonym?.trim() || "",
        });
    }

    return list;
}

function createNamedGroups(
    match: RegExpMatchArray,
    type:
        | "metadata"
        | "multiwordIngredient"
        | "singleWordIngredient"
        | "multiwordCookware"
        | "singleWordCookware"
        | "timer"
        | "shoppingList"
) {
    if (!match) return null;

    const groupMappings = {
        metadata: {
            key: 1,
            value: 2,
        },
        multiwordIngredient: {
            mIngredientName: 3,
            mIngredientQuantity: 4,
            mIngredientUnits: 5,
            mIngredientPreparation: 6,
        },
        singleWordIngredient: {
            sIngredientName: 7,
        },
        multiwordCookware: {
            mCookwareName: 8,
            mCookwareQuantity: 9,
        },
        singleWordCookware: {
            sCookwareName: 10,
        },
        timer: {
            timerName: 11,
            timerQuantity: 12,
            timerUnits: 13,
        },
        shoppingList: {
            name: 14,
            items: 15,
        },
    } as const;

    const mapping = groupMappings[type];
    if (!mapping) {
        throw new Error(`Unknown regex type: ${type}`);
    }

    const groups: Partial<{
        key: string;
        value: string;
        mIngredientName: string;
        mIngredientQuantity: string;
        mIngredientUnits: string;
        mIngredientPreparation: string;
        sIngredientName: string;
        mCookwareName: string;
        mCookwareQuantity: string;
        sCookwareName: string;
        timerName: string;
        timerQuantity: string;
        timerUnits: string;
        name: string;
        items: string;
    }> = {};
    if (type === "singleWordIngredient" && match[0].includes("oil")) {
        console.log(type, match);
    }
    for (const [groupName, index] of Object.entries(mapping)) {
        // Only add the group if it was captured (not undefined)
        if (match[index] !== undefined) {
            // @ts-expect-error
            groups[groupName] = match[index];
        }
    }

    return groups;
}
