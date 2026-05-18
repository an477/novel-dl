async function fetchNovelContent(url) {
    return new Promise((resolve) => {
        // 1. 보안망 우회를 위해 실제 팝업 창 오픈
        const popup = window.open(url, '_blank', 'width=800,height=600,noopener=false,noreferrer=false');
        
        if (!popup) {
            alert("Popup blocker is active! Please allow popups for this site to download.");
            resolve(null);
            return;
        }

        let checkAttempts = 0;
        const maxAttempts = 10; // 최대 10초 대기
        
        const timer = setInterval(() => {
            checkAttempts++;
            try {
                const popupDoc = popup.document;
                const popupWin = popup.window;
                
                // "불러오는 중..." 문구가 사라지고 화면에 완전히 글자가 풀렸을 때 작동
                if (popupDoc && popupDoc.body && !popupDoc.body.innerText.includes("불러오는 중") && popupDoc.body.innerText.length > 300) {
                    clearInterval(timer);
                    
                    // 에피소드 제목 추출
                    let episodeTitle = 'Untitled Episode';
                    const numElem = popupDoc.querySelector('.ne-h1, .ne-num, h1');
                    if (numElem) {
                        episodeTitle = numElem.textContent.trim();
                    }

                    // 2. [완벽 우회 기믹] 팝업창 스스로 본문 전체 선택(Ctrl+A)을 수행하도록 명령
                    const range = popupDoc.createRange();
                    range.selectNodeContents(popupDoc.body);
                    const selection = popupWin.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);

                    // 전체 선택된 상태의 문자열을 가공 없이 100% 날것 그대로 변수에 복사(Ctrl+C 효과)
                    const copiedRawText = selection.toString();
                    
                    // 블록 지정 해제 및 팝업 종료
                    selection.removeAllRanges();
                    popup.close();

                    // 3. [요청하신 자르기 편집 편집기 작동]
                    let cleanedContent = '';
                    
                    // 줄바꿈 문자(\n)가 섞여도 무조건 찾아내는 "16px" ... "기본" 상단 마커 정규식
                    const topMarkerRegex = /16\s*px[\s\+\-±\n]*기본/;
                    const topMatch = copiedRawText.match(topMarkerRegex);

                    if (topMatch) {
                        // "16px ... 기본" 위쪽 라인(상단 헤더, 광고 메뉴 등) 전부 삭제
                        const upperSliced = copiedRawText.substring(topMatch.index + topMatch[0].length).trim();
                        
                        // 하단 마커: 본문이 끝나고 하단 버튼바가 시작되는 "‹ 이전화" 또는 "목록" 위치 추적
                        // 본문 단어 오작동을 막기 위해 텍스트 뒤쪽 영역에서 거꾸로 검색
                        let bottomIndex = upperSliced.lastIndexOf("‹ 이전화");
                        if (bottomIndex === -1 || bottomIndex < (upperSliced.length * 0.5)) {
                            bottomIndex = upperSliced.lastIndexOf("목록");
                        }
                        
                        // 찾았다면 하단 내비게이션 및 댓글 영역 미련 없이 삭제
                        if (bottomIndex !== -1 && bottomIndex > 50) {
                            cleanedContent = upperSliced.substring(0, bottomIndex).trim();
                        } else {
                            cleanedContent = upperSliced;
                        }
                    } else {
                        // 예외 방어 코드: 상단 기준점이 매칭되지 않았다면 수집된 원본 통째로 유지
                        cleanedContent = copiedRawText;
                    }

                    // 처음 주셨던 줄바꿈 정돈 포맷 적용 후 반환
                    cleanedContent = cleanText(cleanedContent);
                    if (cleanedContent.startsWith(episodeTitle)) {
                        cleanedContent = cleanedContent.slice(episodeTitle.length).trim();
                    }

                    resolve({
                        episodeTitle: episodeTitle,
                        content: cleanedContent
                    });
                }
            } catch (e) {
                // 페이지 전환 로딩 순간의 교차 출처 에러 임시 차단
            }

            if (checkAttempts >= maxAttempts) {
                clearInterval(timer);
                console.error(`Timeout waiting for popup window injection on: ${url}`);
                try { popup.close(); } catch(_) {}
                resolve(null);
            }
        }, 200);
    });
}

function unescapeHTML(text) {
    const entities = {
        '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'",
        '&nbsp;': ' ', '&ndash;': '-', '&mdash;': '--', '&lsquo;': "'",
        '&raquo;': "'", '&ldquo;': '"', '&rdquo;': '"'
    };
    Object.entries(entities).forEach(([entity, replacement]) => {
        text = text.replace(new RegExp(entity, 'g'), replacement);
    });
    return text;
}

function cleanText(text) {
    text = unescapeHTML(text);
    return text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n\n')
        .replace(/\n{3,}/g, '\n\n');
}

// ... 이하 createModal, downloadNovel, runCrawler 등 기존 UI 제어 코드 결합 구동
