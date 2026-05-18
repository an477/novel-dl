async function fetchNovelContent(url) {
    return new Promise((resolve) => {
        // 1. 보안 장벽 우회를 위해 실제 팝업 창 오픈
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
                const popupDoc = popup.document;
                
                // Ctrl+A -> Ctrl+C 한 것과 완전히 동일한 화면 전체의 순수 텍스트 추출
                const bodyText = popupDoc.body ? popupDoc.body.innerText : '';
                
                // 화면에 "글자", "px", "기본" 메뉴가 나타났고, "불러오는 중..."이 완전히 사라졌을 때를 로딩 완료로 판정
                if (bodyText && bodyText.includes("글자") && bodyText.includes("기본") && !bodyText.includes("불러오는 중")) {
                    
                    // 상단 기준점: "16px"과 "기본" 사이에 어떤 공백이나 줄바꿈(\n), 부호가 있어도 다 잡아내는 유연한 정규식
                    const topMarkerRegex = /16\s*px[\s\+\-±\n]*기본/;
                    const topMatch = bodyText.match(topMarkerRegex);

                    let pureContent = '';

                    if (topMatch) {
                        // "16px ... 기본" 툴바 바로 다음 글자부터 끝까지 슬라이스
                        const upperSliced = bodyText.substring(topMatch.index + topMatch[0].length).trim();
                        
                        // 하단 기준점: 소설 본문이 끝나고 내비게이션 바가 시작되는 "‹ 이전화" 또는 "목록" 단어 추적
                        // 본문 내용 중에 "목록"이라는 단어가 섞여 오작동하는 것을 막기 위해 하단 근처(뒤에서부터) 검색
                        let bottomIndex = upperSliced.lastIndexOf("‹ 이전화");
                        if (bottomIndex === -1 || bottomIndex < (upperSliced.length * 0.5)) {
                            bottomIndex = upperSliced.lastIndexOf("목록");
                        }
                        
                        if (bottomIndex !== -1 && bottomIndex > 50) {
                            // 상단 툴바 뒷 지점부터 하단 버튼 바 앞 지점까지만 정확하게 샌드위치 커팅
                            pureContent = upperSliced.substring(0, bottomIndex).trim();
                        }
                    }

                    // 만약 샌드위치 커팅이 실패했거나 본문이 너무 짧다면 방어 코드로 전체 텍스트 강제 반환 예외 처리
                    if (!pureContent || pureContent.length < 50) {
                        pureContent = bodyText;
                    }

                    // 에피소드 제목 추출
                    let episodeTitle = 'Untitled Episode';
                    const numElem = popupDoc.querySelector('.ne-h1, .ne-num, h1');
                    if (numElem) {
                        episodeTitle = numElem.textContent.trim();
                    }

                    // 수집 완료 즉시 팝업 닫기
                    popup.close();
                    clearInterval(timer);
                    
                    // 처음 주셨던 규격 포맷대로 깔끔하게 줄바꿈 정리
                    pureContent = cleanText(pureContent);
                    if (pureContent.startsWith(episodeTitle)) {
                        pureContent = pureContent.slice(episodeTitle.length).trim();
                    }

                    resolve({
                        episodeTitle: episodeTitle,
                        content: pureContent
                    });
                }
            } catch (e) {
                // 크로스 도메인 로딩 순간의 일시적인 예외 에러 무시
            }

            if (checkAttempts >= maxAttempts) {
                clearInterval(timer);
                console.error(`Timeout waiting for Next.js text rendering on: ${url}`);
                try { popup.close(); } catch(_) {}
                resolve(null);
            }
        }, 200); // 0.2초 간격 폴링 감시
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
