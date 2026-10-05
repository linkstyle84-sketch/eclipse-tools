/**
 * 이클립스 잠재력 시연 — 공유 페이지
 *
 * 시트·드라이브에 접근하지 않습니다.
 *
 * 배포할 때 Index 파일에는 미리보기.html 을 붙여넣는다.
 * (그림이 HTML 안에 들어 있음. eclipse-header.png 를 따로 올리면 안 됨)
 *
 * 이미 배포한 뒤에는 저장만 하지 말고
 * 배포 → 배포 관리 → 수정 → 버전: 새 버전 → 배포
 *
 * 배포 → 새 배포 → 웹 앱
 *  - 실행 계정: 나
 *  - 액세스 권한: 모든 사용자
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('이클립스 잠재력 시연')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
