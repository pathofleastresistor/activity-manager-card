const UNPKG_LIT = "https://unpkg.com/lit@2.8.0/";

export async function resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(UNPKG_LIT)) {
        const subpath = specifier.slice(UNPKG_LIT.length).replace(/\?module$/, "");
        return nextResolve(new URL(`../node_modules/lit/${subpath}`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
}
