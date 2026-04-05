export function isEligiblePage(isVideoPage, isShortsPage) {
    return isVideoPage() && !isShortsPage();
}
