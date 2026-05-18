async function fetchNovelContent(url) {
    return new Promise((resolve) => {
        // 1. 각 회차별 페이지를 실제 팝업 창으로 오픈
        const popup = window.open(url, '_blank', 'width=800,height=600,noopener=false,noreferrer=false');
        
        if (!popup) {
            alert("Popup blocker is active! Please allow popups for this site to download.");
            resolve(null);
            return;
        }

        let checkAttempts = 0;
        const maxAttempts = 50; // 최대 10초 대기
        
        const timer = setInterval(() => {
            checkAttempts++;
            try {
                const popupWindow = popup.window;
                const popupDoc = popup.document;
                
                // 팝업 창의 body가 존재하고, Next.js의 "불러오는 중..." 문구가 완전히 사라졌을 때 작업 개시
                if (popupDoc && popupDoc.body && !popupDoc.body.innerText.includes("불러오는 중") && popupDoc.body.innerText.length > 300) {
                    clearInterval(timer);
                    
                    // 에피소드 제목 추출
                    let episodeTitle = 'Untitled Episode';
                    const numElem = popupDoc.querySelector('.ne-h1, .ne-num, h1');
                    if (numElem) {
                        episodeTitle = numElem.textContent.trim();
                    }

                    // 2. [팝업 창 내부에서 Ctrl + A 직접 수행 효과 구현]
                    // 팝업 창의 window context에서 Selection 객체를 생성하여 전범위를 블록 지정합니다.
                    const range = popupDoc.createRange();
                    range.selectNodeContents(popupDoc.body);
                    
                    const selection = popupWindow.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range); // 팝업 창 내부 전체 선택 완료 (Ctrl + A 상태)

                    // 3. 복사(Ctrl + C) 처리된 순수 문자열 데이터를 가로채기
                    const grabbedRawText = selection.toString();

                    // Selection 영역 메모리 해제 및 팝업 닫기
                    selection.removeAllRanges();
                    popup.close();

                    // 4. [편집 및 정제 로직] 
                    // 전체 선택으로 복사된 덩어리에서 불필요한 위아래 영역 도려내기
                    let cleanedContent = '';
                    
                    // "16px\n+\n기본" 또는 "16px + 기본" 레이아웃 문자열 위치 탐색
                    const topMarkerRegex = /16\s*px[\s\+\-±\n]*기본/;
                    const topMatch = grabbedRawText.match(topMarkerRegex);

                    if (topMatch) {
                        // "기본" 텍스트 위쪽(상단 광고, 메뉴 등)을 전부 잘라냄
                        const upperSliced = grabbedRawText.substring(topMatch.index + topMatch[0].length).trim();
                        
                        // 하단 뷰어 종료 시점 내비게이션 바인 "‹ 이전화" 또는 "목록" 위치 탐색
                        let bottomIndex = upperSliced.lastIndexOf("‹ 이전화");
                        if (bottomIndex === -1 || bottomIndex < (upperSliced.length * 0.5)) {
                            bottomIndex = upperSliced.lastIndexOf("목록");
                        }
                        
                        // 찾았다면 하단 메뉴 찌꺼기 완벽 차단 및 삭제
                        if (bottomIndex !== -1 && bottomIndex > 50) {
                            cleanedContent = upperSliced.substring(0, bottomIndex).trim();
                        } else {
                            cleanedContent = upperSliced;
                        }
                    } else {
                        // 기준점 매칭에 예외가 발생했을 경우 복사된 원본 그대로 보존 처리
                        cleanedContent = grabbedRawText;
                    }

                    // 최종 포맷 가공 후 반환
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
                // 페이지가 전환되거나 로딩 중일 때 발생하는 Cross-Origin 브라우저 에러 임시 차단
            }

            if (checkAttempts >= maxAttempts) {
                clearInterval(timer);
                console.error(`Timeout waiting for popup text generation on: ${url}`);
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
