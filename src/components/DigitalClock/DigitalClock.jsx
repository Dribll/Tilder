import React, { useState, useEffect } from 'react'

export default function DigitalClock() {
    let time = new Date().toLocaleTimeString();
    const [currentTime, setCurrentTime] = useState(time);

    useEffect(() => {
        const updateTime = () => {
            let time = new Date().toLocaleTimeString();
            setCurrentTime(time);
        }
        const intervalId = setInterval(updateTime, 1000);
        return () => clearInterval(intervalId);
    }, []);

    return (
        <>
            <b style={{display: 'inline'}}>{currentTime}</b>
        </>
    )
}
