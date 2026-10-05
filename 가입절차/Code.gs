/**
 * 이클립스 헤스5 딸깍팀 길드원 안내 — 공유 페이지
 * 공지방 · 디스코드 · 분배시트
 *
 * 시트·드라이브에 접근하지 않습니다.
 *
 * 배포 → 새 배포 → 웹 앱
 *  - 실행 계정: 나
 *  - 액세스 권한: 모든 사용자
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('이클립스 헤스5 딸깍팀 길드원 안내')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
