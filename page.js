(function() {
    // 1. 현재 화면에 표시된 에피소드 제목 추출
    let episodeTitle = 'Untitled_Episode';
    const numElem = document.querySelector('.ne-h1, .ne-num, h1');
    if (numElem) {
        episodeTitle = numElem.textContent.trim();
    }

    // 2. 이미 로딩이 완료되어 화면에 그려진 진짜 본문 데이터 영역 타겟팅
    // (Next.js가 런타임에서 조립을 마친 최종 결과물 DOM을 가져옵니다)
    const contentContainer = document.querySelector('.novel-viewer, article, .view-content, #novel_content');
    
    if (!contentContainer) {
        alert("Failed to find the novel container. Please make sure the episode is fully loaded.");
        return;
    }

    // 3. 텍스트 추출 및 정리 함수 (처음 규칙 유지)
    function cleanText(htmlContent) {
        let text = htmlContent;
        text = text.replace(/<div>/g, '');
        text = text.replace(/<\/div>/g, '');
        text = text.replace(/<p>/g, '\n');
        text = text.replace(/<\/p>/g, '\n');
        text = text.replace(/<br\s*[/]?>/g, '\n');
        text = text.replace(/<img[^>]*>/gi, '[skipped image]');
        text = text.replace(/<[^>]*>/g, '');
        text = text.replace(/ {2,}/g, ' ');
        
        // 이스케이프 문자 정리
        const entities = {
            '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'",
            '&nbsp;': ' ', '&ndash;': '-', '&mdash;': '--'
        };
        Object.entries(entities).forEach(([entity, replacement]) => {
            text = text.replace(new RegExp(entity, 'g'), replacement);
        });

        return text.split('\n')
                   .map(line => line.trim())
                   .filter(line => line.length > 0)
                   .join('\n\n');
    }

    let finalContent = cleanText(contentContainer.innerHTML);

    if (!finalContent || finalContent.includes("불러오는 중") || finalContent.length < 50) {
        alert("Content is still loading or empty. Please wait until the text appears on screen.");
        return;
    }

    // 제목 중복 처리 방지
    if (finalContent.startsWith(episodeTitle)) {
        finalContent = finalContent.slice(episodeTitle.length).trim();
    }

    const outputText = `${episodeTitle}\n\n${finalContent}`;

    // 4. 추출된 텍스트를 파일로 즉시 다운로드
    const blob = new Blob([outputText], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${episodeTitle.replace(/[/\\?%*:|"<>]/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    console.log(`Successfully saved: ${episodeTitle}`);
})();
